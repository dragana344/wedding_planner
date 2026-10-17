"use client";

import { useState } from "react";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { BUDGET_CATEGORIES, getBudgetCategoryLabel } from "@/lib/couple/budget-categories";
import type { BudgetItem, BudgetSummary } from "@/lib/couple/budget";
import { Icon } from "@/components/venue/shell/Icon";
import { formatDen } from "@/lib/money";
import "@/components/couple/StatSummaryCard.css";
import "./BudgetClient.css";

interface ItemFormState {
  category: string;
  custom_label: string;
  name: string;
  estimated_amount: string;
  paid_amount: string;
}

const EMPTY_FORM: ItemFormState = { category: BUDGET_CATEGORIES[0].id, custom_label: "", name: "", estimated_amount: "", paid_amount: "" };

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
  };
}

/** paid/estimated as a 0-100 fill percentage for the row's mini bar. No
 * estimate recorded yet: full when anything was paid, otherwise empty —
 * there's no "percent of nothing" to show. */
function fillPercent(paid: number, estimated: number | null): number {
  if (estimated === null || estimated <= 0) return paid > 0 ? 100 : 0;
  return Math.min(100, Math.round((paid / estimated) * 100));
}

export function BudgetClient({ initialSummary }: { initialSummary: BudgetSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setSummary((prev) => ({
        ...prev,
        items: sortBudgetItems([...prev.items, created]),
        totalEstimated: prev.totalEstimated + (created.estimated_amount ?? 0),
        totalPaid: prev.totalPaid + created.paid_amount,
        remaining: prev.remaining + (created.estimated_amount ?? 0) - created.paid_amount,
      }));
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на ставката.");
    } finally {
      setIsSubmitting(false);
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

  const paidPct = summary.totalEstimated > 0 ? Math.round((summary.totalPaid / summary.totalEstimated) * 100) : 0;
  const remainingPct = Math.max(0, 100 - paidPct);
  const hasVenueLine = summary.venue.estimated_amount !== null || summary.venue.paid_amount !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel couple-card stat-summary">
        <p className="stat-summary-eyebrow">Проценет буџет</p>

        <div className="stat-summary-headline">
          <div className="stat-summary-stat stat-summary-stat-main">
            <span className="stat-summary-num">{formatDen(summary.totalEstimated)}</span>
          </div>
          <div className="stat-summary-headline-secondary">
            <div className="stat-summary-stat">
              <span className="stat-summary-num">{formatDen(summary.totalPaid)}</span>
              <span className="stat-summary-sub">платено досега</span>
            </div>
            <div className="stat-summary-stat">
              <span className="stat-summary-num">{formatDen(summary.remaining)}</span>
              <span className="stat-summary-sub">преостанато</span>
            </div>
          </div>
        </div>

        <div role="img" aria-label={`Буџет: платено ${paidPct}%, преостанато ${remainingPct}%`} className="stat-summary-bar">
          {paidPct > 0 ? <div style={{ flexGrow: paidPct, flexBasis: 0, background: "#c9a24a" }} /> : null}
          {remainingPct > 0 ? <div style={{ flexGrow: remainingPct, flexBasis: 0, background: "#d8cbb0" }} /> : null}
        </div>

        <ul className="stat-summary-legend">
          <li>
            <span aria-hidden className="stat-summary-dot" style={{ background: "#c9a24a" }} />
            Платено {paidPct}%
          </li>
          <li>
            <span aria-hidden className="stat-summary-dot" style={{ background: "#d8cbb0" }} />
            Преостанато {remainingPct}%
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2" style={{ alignItems: "start" }}>
        <div className="panel couple-card">
          <div className="panel-h" style={{ justifyContent: "space-between" }}>
            <h2 className="panel-t">Ставки</h2>
            <span style={{ color: "var(--muted)", fontSize: 13.5 }}>
              {summary.items.length} {summary.items.length === 1 ? "ставка" : "ставки"}
            </span>
          </div>
          <div>
            {hasVenueLine ? (
              <div className="budget-row">
                <div className="budget-row-head">
                  <p className="budget-row-name">Локал</p>
                  <p className="budget-row-amount">
                    {summary.venue.paid_amount !== null ? formatDen(summary.venue.paid_amount) : "—"} од{" "}
                    {summary.venue.estimated_amount !== null ? formatDen(summary.venue.estimated_amount) : "—"}
                  </p>
                </div>
                <div className="budget-row-bottom">
                  <span className="budget-pill">Фиксно</span>
                  <div className="budget-row-track">
                    <div
                      className="budget-row-fill"
                      style={{ width: `${fillPercent(summary.venue.paid_amount ?? 0, summary.venue.estimated_amount)}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {summary.items.length === 0 && !hasVenueLine ? (
              <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "14px 4px", margin: 0 }}>Сè уште нема додадени ставки.</p>
            ) : null}

            {summary.items.map((item) =>
              editingId === item.id ? (
                <div key={item.id} className="budget-edit-row">
                  <select className="fld" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                    {BUDGET_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {editForm.category === "other" ? (
                    <input
                      className="fld"
                      placeholder="Сопствена категорија"
                      aria-label="Сопствена категорија"
                      value={editForm.custom_label}
                      onChange={(e) => setEditForm({ ...editForm, custom_label: e.target.value })}
                    />
                  ) : null}
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => handleSaveEdit(item.id)} className="btn btn-gold">
                      Зачувај
                    </button>
                    <button type="button" onClick={cancelEdit} className="btn btn-ghost">
                      Откажи
                    </button>
                  </div>
                </div>
              ) : (
                <div key={item.id} className="budget-row">
                  <p className="budget-row-category">{item.category === "other" && item.custom_label ? item.custom_label : getBudgetCategoryLabel(item.category)}</p>
                  <div className="budget-row-head">
                    <p className="budget-row-name">{item.name}</p>
                    <p className="budget-row-amount">
                      {formatDen(item.paid_amount)} од {item.estimated_amount !== null ? formatDen(item.estimated_amount) : "—"}
                    </p>
                  </div>
                  <div className="budget-row-bottom">
                    <div className="budget-row-track">
                      <div className="budget-row-fill" style={{ width: `${fillPercent(item.paid_amount, item.estimated_amount)}%` }} />
                    </div>
                  </div>
                  <div className="budget-row-actions">
                    <button type="button" onClick={() => startEdit(item)} aria-label={`Измени ${item.name}`} className="budget-link">
                      Измени
                    </button>
                    <button type="button" onClick={() => handleDelete(item.id)} aria-label={`Избриши ${item.name}`} className="budget-link budget-link-danger">
                      Избриши
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        <div className="panel couple-card">
          <div className="panel-h">
            <h2 className="panel-t">
              <Icon name="plus" size="sm" /> Додади ставка
            </h2>
          </div>
          <form onSubmit={handleAdd} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label className="lab-s" htmlFor="budget-category">
                Категорија
              </label>
              <select id="budget-category" className="fld" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {BUDGET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {form.category === "other" ? (
              <div>
                <label className="lab-s" htmlFor="budget-custom-category">
                  Сопствена категорија
                </label>
                <input
                  id="budget-custom-category"
                  className="fld"
                  value={form.custom_label}
                  onChange={(e) => setForm({ ...form, custom_label: e.target.value })}
                />
              </div>
            ) : null}
            <div>
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
            {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
            <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
              {isSubmitting ? "Се додава..." : "Додади ставка"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
