"use client";

import { useState } from "react";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { BUDGET_CATEGORIES, getBudgetCategoryLabel } from "@/lib/couple/budget-categories";
import { BUDGET_SUGGESTIONS, type BudgetSuggestion } from "@/lib/couple/budget-suggestions";
import type { BudgetItem, BudgetSummary } from "@/lib/couple/budget";
import { Icon } from "@/components/venue/shell/Icon";
import { SprigIcon } from "@/components/seating/couple-icons";
import { formatDen } from "@/lib/money";
import "@/components/seating/couple-seating.css";
import "./BudgetClient.css";

interface ItemFormState {
  category: string;
  custom_label: string;
  name: string;
  estimated_amount: string;
  paid_amount: string;
  paid_by: string;
  payment_date: string;
  notes: string;
}

// Manually-added items don't ask the couple to pick a category — picking one
// up front added friction for no benefit, so every item they add by hand
// lands in "Друго" and they can give it its own label instead.
const EMPTY_FORM: ItemFormState = {
  category: "other",
  custom_label: "",
  name: "",
  estimated_amount: "",
  paid_amount: "",
  paid_by: "",
  payment_date: "",
  notes: "",
};

function categoryIndex(categoryId: string): number {
  const idx = BUDGET_CATEGORIES.findIndex((c) => c.id === categoryId);
  return idx === -1 ? BUDGET_CATEGORIES.length : idx;
}

// Mirrors the server-side sort in lib/couple/budget.ts so locally-added or
// -edited items land in the correct category position immediately, instead
// of only after the next reload.
function sortBudgetItems(items: BudgetItem[]): BudgetItem[] {
  return [...items].sort((a, b) => {
    const catDiff = categoryIndex(a.category) - categoryIndex(b.category);
    if (catDiff !== 0) return catDiff;
    return a.created_at.localeCompare(b.created_at);
  });
}

function toInput(form: ItemFormState) {
  return {
    category: form.category,
    custom_label: form.category === "other" ? form.custom_label || null : null,
    name: form.name,
    estimated_amount: form.estimated_amount ? Number(form.estimated_amount) : null,
    paid_amount: form.paid_amount ? Number(form.paid_amount) : 0,
    paid_by: form.paid_by || null,
    payment_date: form.payment_date || null,
    notes: form.notes || null,
  };
}

/** paid/estimated as a 0-100 fill percentage for a row's mini bar. No
 * estimate recorded yet: full when anything was paid, otherwise empty —
 * there's no "percent of nothing" to show. */
function fillPercent(paid: number, estimated: number | null): number {
  if (estimated === null || estimated <= 0) return paid > 0 ? 100 : 0;
  return Math.min(100, Math.round((paid / estimated) * 100));
}

interface CategoryGroup {
  id: string;
  label: string;
  items: BudgetItem[];
  estimated: number;
  paid: number;
}

function buildCategoryGroups(items: BudgetItem[]): CategoryGroup[] {
  return BUDGET_CATEGORIES.map((c) => {
    const catItems = items.filter((i) => i.category === c.id);
    return {
      id: c.id,
      label: c.label,
      items: catItems,
      estimated: catItems.reduce((sum, i) => sum + (i.estimated_amount ?? 0), 0),
      paid: catItems.reduce((sum, i) => sum + i.paid_amount, 0),
    };
  }).filter((g) => g.items.length > 0);
}

function suggestionKey(category: string, name: string): string {
  return `${category}::${name.trim().toLowerCase()}`;
}

/**
 * Styled like the couple's Чеклиста/Распоред pages (couple-seating.css:
 * header, cs-card, cs-btn, --cs-* colours); BudgetClient.css only adds the
 * budget's own pieces (category rollup, add form, suggestions).
 */
export function BudgetClient({ coupleNames, initialSummary }: { coupleNames: string; initialSummary: BudgetSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemFormState>(EMPTY_FORM);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null);

  function applyCreated(created: BudgetItem) {
    setSummary((prev) => ({
      ...prev,
      items: sortBudgetItems([...prev.items, created]),
      totalEstimated: prev.totalEstimated + (created.estimated_amount ?? 0),
      totalPaid: prev.totalPaid + created.paid_amount,
      remaining: prev.remaining + (created.estimated_amount ?? 0) - created.paid_amount,
    }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created: BudgetItem = await jsonOrThrow(
        await fetch("/api/couple/budget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toInput(form)),
        })
      );
      applyCreated(created);
      setExpandedCategories((prev) => new Set(prev).add(created.category));
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на ставката.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddSuggestion(suggestion: BudgetSuggestion) {
    setError(null);
    setAddingSuggestionId(suggestion.id);
    try {
      const created: BudgetItem = await jsonOrThrow(
        await fetch("/api/couple/budget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: suggestion.category,
            custom_label: null,
            name: suggestion.name,
            estimated_amount: null,
            paid_amount: 0,
            paid_by: null,
            payment_date: null,
            notes: null,
          }),
        })
      );
      applyCreated(created);
      setExpandedCategories((prev) => new Set(prev).add(created.category));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на предложената ставка.");
    } finally {
      setAddingSuggestionId(null);
    }
  }

  function startEdit(item: BudgetItem) {
    setEditingId(item.id);
    setEditForm({
      category: item.category,
      custom_label: item.custom_label ?? "",
      name: item.name,
      estimated_amount: item.estimated_amount?.toString() ?? "",
      paid_amount: item.paid_amount.toString(),
      paid_by: item.paid_by ?? "",
      payment_date: item.payment_date ?? "",
      notes: item.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(itemId: string) {
    setError(null);
    try {
      const updated: BudgetItem = await jsonOrThrow(
        await fetch(`/api/couple/budget/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toInput(editForm)),
        })
      );
      setSummary((prev) => {
        const items = sortBudgetItems(prev.items.map((i) => (i.id === itemId ? updated : i)));
        const totalEstimated = items.reduce((sum, i) => sum + (i.estimated_amount ?? 0), 0) + (prev.venue.estimated_amount ?? 0);
        const totalPaid = items.reduce((sum, i) => sum + i.paid_amount, 0) + (prev.venue.paid_amount ?? 0);
        return { ...prev, items, totalEstimated, totalPaid, remaining: totalEstimated - totalPaid };
      });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на ставката.");
    }
  }

  async function handleDelete(itemId: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/budget/${itemId}`, { method: "DELETE" }));
      setSummary((prev) => {
        const items = prev.items.filter((i) => i.id !== itemId);
        const totalEstimated = items.reduce((sum, i) => sum + (i.estimated_amount ?? 0), 0) + (prev.venue.estimated_amount ?? 0);
        const totalPaid = items.reduce((sum, i) => sum + i.paid_amount, 0) + (prev.venue.paid_amount ?? 0);
        return { ...prev, items, totalEstimated, totalPaid, remaining: totalEstimated - totalPaid };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на ставката.");
    }
  }

  function toggleCategory(categoryId: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  const paidPct = summary.totalEstimated > 0 ? Math.round((summary.totalPaid / summary.totalEstimated) * 100) : 0;
  const remainingPct = Math.max(0, 100 - paidPct);
  const hasVenueLine = summary.venue.estimated_amount !== null || summary.venue.paid_amount !== null;
  const groups = buildCategoryGroups(summary.items);
  const allExpanded = groups.length > 0 && groups.every((g) => expandedCategories.has(g.id));
  const addedKeys = new Set(summary.items.map((i) => suggestionKey(i.category, i.name)));
  const suggestions = BUDGET_SUGGESTIONS.filter((s) => !addedKeys.has(suggestionKey(s.category, s.name)));

  function toggleAll() {
    setExpandedCategories(allExpanded ? new Set() : new Set(groups.map((g) => g.id)));
  }

  function renderItemRow(item: BudgetItem) {
    if (editingId === item.id) {
      return (
        <div key={item.id} className="bg-edit-row">
          <input className="fld" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <input
            className="fld"
            placeholder="Проценет износ"
            aria-label="Проценет износ"
            type="number"
            value={editForm.estimated_amount}
            onChange={(e) => setEditForm({ ...editForm, estimated_amount: e.target.value })}
          />
          <input
            className="fld"
            placeholder="Платено досега"
            aria-label="Платено досега"
            type="number"
            value={editForm.paid_amount}
            onChange={(e) => setEditForm({ ...editForm, paid_amount: e.target.value })}
          />
          <input
            className="fld"
            placeholder="Платено од"
            aria-label="Платено од"
            value={editForm.paid_by}
            onChange={(e) => setEditForm({ ...editForm, paid_by: e.target.value })}
          />
          <input
            className="fld"
            type="date"
            aria-label="Датум на плаќање"
            value={editForm.payment_date}
            onChange={(e) => setEditForm({ ...editForm, payment_date: e.target.value })}
          />
          <textarea
            className="fld"
            placeholder="Белешки"
            aria-label="Белешки"
            value={editForm.notes}
            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
          />
          <div className="bg-edit-actions">
            <button type="button" onClick={() => handleSaveEdit(item.id)} className="cs-btn cs-btn-primary">
              Зачувај
            </button>
            <button type="button" onClick={cancelEdit} className="cs-btn">
              Откажи
            </button>
          </div>
        </div>
      );
    }
    const pct = fillPercent(item.paid_amount, item.estimated_amount);
    return (
      <div key={item.id} className="bg-item">
        <div className="bg-item-main">
          <p className="bg-item-name">{item.category === "other" && item.custom_label ? item.custom_label : item.name}</p>
          <div className="bg-row-track">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="bg-item-amount">
          {formatDen(item.paid_amount)} од {item.estimated_amount !== null ? formatDen(item.estimated_amount) : "—"}
        </span>
        <div className="bg-item-actions">
          <button type="button" onClick={() => startEdit(item)} aria-label={`Измени ${item.name}`} className="bg-action">
            <Icon name="edit" size="sm" />
            Измени
          </button>
          <span className="bg-action-div" aria-hidden />
          <button type="button" onClick={() => handleDelete(item.id)} aria-label={`Избриши ${item.name}`} className="bg-action bg-action-danger">
            <Icon name="trash" size="sm" />
            Избриши
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cs-page bg">
      <header className="cs-head">
        <SprigIcon className="cs-head-sprig" />
        <div className="cs-head-text">
          <p className="cs-eyebrow">{coupleNames}</p>
          <h2 className="cs-title">Буџет</h2>
          <p className="bg-sub">Следете ги трошоците на вашиот настан</p>
        </div>
      </header>

      <section className="cs-card bg-progress" aria-label="Преглед на буџетот">
        <SprigIcon className="bg-progress-sprig" />
        <p className="bg-eyebrow">Преглед на буџетот</p>
        <div className="bg-progress-row">
          <p className="bg-score">
            <span className="bg-score-num">{formatDen(summary.totalEstimated)}</span>
            <span className="bg-score-lab">вкупен буџет</span>
          </p>
          <p className="bg-secondary">
            <span className="bg-secondary-num">{formatDen(summary.totalPaid)}</span>
            <span className="bg-score-lab">
              платено <b>{paidPct}%</b>
            </span>
          </p>
          <p className="bg-secondary">
            <span className="bg-secondary-num">{formatDen(summary.remaining)}</span>
            <span className="bg-score-lab">
              преостанато <b>{remainingPct}%</b>
            </span>
          </p>
        </div>
        <div role="img" aria-label={`Буџет: платено ${paidPct}%, преостанато ${remainingPct}%`} className="bg-bar">
          <span style={{ width: `${paidPct}%` }} />
        </div>
      </section>

      <div className="bg-grid">
        <section className="cs-card bg-categories" aria-labelledby="bg-cat-h">
          <div className="bg-card-head">
            <h2 id="bg-cat-h" className="bg-card-title">
              Трошоци по категории
            </h2>
            <span className="bg-muted">
              {summary.items.length} {summary.items.length === 1 ? "ставка" : "ставки"}
            </span>
          </div>

          {hasVenueLine ? (
            <div className="bg-row bg-row-fixed">
              <div className="bg-row-main">
                <p className="bg-item-name">Локал</p>
                <div className="bg-row-track">
                  <span style={{ width: `${fillPercent(summary.venue.paid_amount ?? 0, summary.venue.estimated_amount)}%` }} />
                </div>
              </div>
              <span className="bg-item-amount">
                {summary.venue.paid_amount !== null ? formatDen(summary.venue.paid_amount) : "—"} од{" "}
                {summary.venue.estimated_amount !== null ? formatDen(summary.venue.estimated_amount) : "—"}
              </span>
              <span className="bg-pill bg-pill-fixed">Фиксно</span>
            </div>
          ) : null}

          {groups.length === 0 && !hasVenueLine ? <p className="bg-empty">Сè уште нема додадени ставки.</p> : null}

          {groups.map((group) => {
            const isOpen = expandedCategories.has(group.id);
            const pct = fillPercent(group.paid, group.estimated);
            return (
              <div key={group.id} className="bg-row">
                <button type="button" className="bg-cat-head" onClick={() => toggleCategory(group.id)} aria-expanded={isOpen}>
                  <span className="bg-row-main">
                    <span className="bg-cat-name">{group.label}</span>
                    <span className="bg-row-track">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                  <span className="bg-item-amount">
                    {formatDen(group.paid)} / {formatDen(group.estimated)}
                  </span>
                  <span className="bg-pill">{pct}%</span>
                  <Icon name="down" size="sm" className="bg-caret" />
                </button>
                {isOpen ? <div className="bg-cat-items">{group.items.map(renderItemRow)}</div> : null}
              </div>
            );
          })}

          {groups.length > 0 ? (
            <button type="button" className="bg-toggle-all" onClick={toggleAll}>
              {allExpanded ? "Собери ги сите ставки" : `Види ги сите ставки (${summary.items.length})`}
              <Icon name="down" size="sm" />
            </button>
          ) : null}
        </section>

        <div className="bg-side">
          <section className="cs-card bg-add">
            <h2 className="bg-card-head">
              <button
                type="button"
                className="bg-add-toggle"
                onClick={() => setFormOpen((v) => !v)}
                aria-expanded={formOpen}
                aria-label={formOpen ? "Сокриј ја формата за нова ставка" : "Прикажи ја формата за нова ставка"}
              >
                <Icon name="plus" size="sm" />
                <span className="bg-card-title">Додади ставка</span>
                <Icon name="down" size="sm" className="bg-caret" />
              </button>
            </h2>
            {formOpen ? (
              <form onSubmit={handleAdd} className="bg-add-form">
                <div className="bg-form-span2">
                  <label className="lab-s" htmlFor="budget-name">
                    Име на ставка
                  </label>
                  <input
                    id="budget-name"
                    className="fld"
                    placeholder="пр. Торта"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="lab-s" htmlFor="budget-estimated">
                    Проценет износ
                  </label>
                  <input
                    id="budget-estimated"
                    className="fld"
                    type="number"
                    value={form.estimated_amount}
                    onChange={(e) => setForm({ ...form, estimated_amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="lab-s" htmlFor="budget-paid">
                    Платено досега
                  </label>
                  <input id="budget-paid" className="fld" type="number" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} />
                </div>
                <div>
                  <label className="lab-s" htmlFor="budget-paid-by">
                    Платено од
                  </label>
                  <input
                    id="budget-paid-by"
                    className="fld"
                    placeholder="пр. Вашето име / компанија"
                    value={form.paid_by}
                    onChange={(e) => setForm({ ...form, paid_by: e.target.value })}
                  />
                </div>
                <div>
                  <label className="lab-s" htmlFor="budget-payment-date">
                    Датум на плаќање
                  </label>
                  <input
                    id="budget-payment-date"
                    className="fld"
                    type="date"
                    value={form.payment_date}
                    onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                  />
                </div>
                <div className="bg-form-span2">
                  <label className="lab-s" htmlFor="budget-notes">
                    Белешки (опционално)
                  </label>
                  <textarea
                    id="budget-notes"
                    className="fld"
                    placeholder="Дополнителни информации..."
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                {error ? (
                  <p className="cs-error bg-form-span2">{error}</p>
                ) : null}
                <button type="submit" disabled={isSubmitting} className="cs-btn cs-btn-primary bg-submit bg-form-span2">
                  {isSubmitting ? "Се додава..." : "Додади ставка"}
                </button>
              </form>
            ) : null}
          </section>

          <section className="cs-card bg-suggestions">
            <div className="bg-card-head">
              <h2 className="bg-card-title">Предложени ставки</h2>
            </div>
            {suggestions.length === 0 ? (
              <p className="bg-empty">Ги додадовте сите предложени ставки.</p>
            ) : (
              suggestions.map((s) => (
                <div key={s.id} className="bg-suggestion-row">
                  <div>
                    <p className="bg-suggestion-name">{s.name}</p>
                    <p className="bg-suggestion-category">{getBudgetCategoryLabel(s.category)}</p>
                  </div>
                  <button
                    type="button"
                    className="bg-suggestion-check"
                    aria-label={`Додади ${s.name}`}
                    disabled={addingSuggestionId === s.id}
                    onClick={() => handleAddSuggestion(s)}
                  >
                    <Icon name="check" size="sm" />
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
