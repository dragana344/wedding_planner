"use client";

import { useState } from "react";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { BUDGET_CATEGORIES, getBudgetCategoryLabel } from "@/lib/couple/budget-categories";
import type { BudgetItem, BudgetSummary } from "@/lib/couple/budget";

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
      setError(err instanceof Error ? err.message : "Failed to add item.");
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
      setError(err instanceof Error ? err.message : "Failed to update item.");
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
      setError(err instanceof Error ? err.message : "Failed to delete item.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="tiles" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <div className="tile">
          <div>
            <div className="num">{summary.totalEstimated}</div>
            <div className="lab">Estimated</div>
          </div>
        </div>
        <div className="tile">
          <div>
            <div className="num">{summary.totalPaid}</div>
            <div className="lab">Paid so far</div>
          </div>
        </div>
        <div className="tile">
          <div>
            <div className="num">{summary.remaining}</div>
            <div className="lab">Remaining</div>
          </div>
        </div>
      </div>

      <div className="ev">
        <p style={{ fontWeight: 700, margin: 0 }}>Venue</p>
        <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>
          Estimated: {summary.venue.estimated_amount ?? "Not set"} · Paid: {summary.venue.paid_amount ?? "Not set"}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {summary.items.map((item) => (
          <div key={item.id} className="ev">
            {editingId === item.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                    placeholder="Custom category"
                    value={editForm.custom_label}
                    onChange={(e) => setEditForm({ ...editForm, custom_label: e.target.value })}
                  />
                ) : null}
                <input className="fld" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                <input
                  className="fld"
                  placeholder="Estimated amount"
                  type="number"
                  value={editForm.estimated_amount}
                  onChange={(e) => setEditForm({ ...editForm, estimated_amount: e.target.value })}
                />
                <input
                  className="fld"
                  placeholder="Paid so far"
                  type="number"
                  value={editForm.paid_amount}
                  onChange={(e) => setEditForm({ ...editForm, paid_amount: e.target.value })}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => handleSaveEdit(item.id)} className="btn btn-gold">
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit} className="btn btn-ghost">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>
                    {item.category === "other" && item.custom_label ? item.custom_label : getBudgetCategoryLabel(item.category)}
                  </p>
                  <p style={{ fontWeight: 700, margin: 0 }}>{item.name}</p>
                  <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>
                    Estimated: {item.estimated_amount ?? "—"} · Paid: {item.paid_amount}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => startEdit(item)} aria-label={`Edit ${item.name}`} className="btn btn-ghost">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(item.id)} aria-label={`Delete ${item.name}`} className="btn btn-ghost" style={{ color: "var(--bad)" }}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <select className="fld" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {BUDGET_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {form.category === "other" ? (
          <input className="fld" placeholder="Custom category" value={form.custom_label} onChange={(e) => setForm({ ...form, custom_label: e.target.value })} />
        ) : null}
        <input className="fld" placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input
          className="fld"
          placeholder="Estimated amount"
          type="number"
          value={form.estimated_amount}
          onChange={(e) => setForm({ ...form, estimated_amount: e.target.value })}
        />
        <input
          className="fld"
          placeholder="Paid so far"
          type="number"
          value={form.paid_amount}
          onChange={(e) => setForm({ ...form, paid_amount: e.target.value })}
        />
        {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
          {isSubmitting ? "Adding..." : "Add item"}
        </button>
      </form>
    </div>
  );
}
