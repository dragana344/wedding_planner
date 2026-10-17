"use client";

import { useState } from "react";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import type { ChecklistItem, ChecklistStats, ChecklistSubtask } from "@/lib/couple/checklist";
import { formatMkDate, todayIn } from "@/lib/date";
import { Icon } from "@/components/venue/shell/Icon";
import "@/components/couple/StatSummaryCard.css";
import "./ChecklistClient.css";

function SubtaskList({ item, onChanged }: { item: ChecklistItem; onChanged: () => void }) {
  const [newTitle, setNewTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await jsonOrThrow(
        await fetch(`/api/couple/checklist/${item.id}/subtasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        })
      );
      setNewTitle("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на подзадачата.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggle(subtask: ChecklistSubtask) {
    setError(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/couple/checklist/${item.id}/subtasks/${subtask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_done: !subtask.is_done }),
        })
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на подзадачата.");
    }
  }

  async function handleDelete(subtaskId: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/checklist/${item.id}/subtasks/${subtaskId}`, { method: "DELETE" }));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на подзадачата.");
    }
  }

  return (
    <div className="checklist-subtasks">
      {item.subtasks.map((subtask) => (
        <div key={subtask.id} className="checklist-subtask-row">
          <input type="checkbox" checked={subtask.is_done} onChange={() => handleToggle(subtask)} aria-label={subtask.title} />
          <span className={`checklist-subtask-title${subtask.is_done ? " is-done" : ""}`}>{subtask.title}</span>
          <button type="button" onClick={() => handleDelete(subtask.id)} aria-label={`Избриши ${subtask.title}`} className="checklist-link checklist-link-danger">
            ×
          </button>
        </div>
      ))}
      <form onSubmit={handleAdd} className="checklist-subtask-add">
        <input
          className="fld"
          placeholder="Додади опција или подзадача..."
          aria-label="Додади опција или подзадача..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          style={{ flex: 1, fontSize: 13.5 }}
        />
        <button type="submit" disabled={isSubmitting} className="checklist-add-btn">
          Додади
        </button>
      </form>
      {error ? <p style={{ color: "var(--bad)", fontSize: 12.5, margin: 0 }}>{error}</p> : null}
    </div>
  );
}

export function ChecklistClient({
  initialItems,
  initialStats,
}: {
  initialItems: ChecklistItem[];
  initialStats: ChecklistStats;
}) {
  const [items, setItems] = useState(initialItems);
  const [stats, setStats] = useState(initialStats);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refresh() {
    const data = await jsonOrThrow(await fetch("/api/couple/checklist"));
    setItems(data.items);
    setStats(data.stats);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await jsonOrThrow(
        await fetch("/api/couple/checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, due_date: dueDate || null }),
        })
      );
      setTitle("");
      setDueDate("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на задачата.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggle(item: ChecklistItem) {
    setError(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/couple/checklist/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "toggle", is_done: !item.is_done }),
        })
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на задачата.");
    }
  }

  function startEdit(item: ChecklistItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDueDate(item.due_date ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(itemId: string) {
    setError(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/couple/checklist/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: editTitle, due_date: editDueDate || null }),
        })
      );
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на задачата.");
    }
  }

  async function handleDelete(itemId: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/checklist/${itemId}`, { method: "DELETE" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на задачата.");
    }
  }

  const donePct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  const openPct = Math.max(0, 100 - donePct);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="panel couple-card stat-summary">
        <p className="stat-summary-eyebrow">Чеклиста</p>

        <div className="stat-summary-headline">
          <div className="stat-summary-stat stat-summary-stat-main">
            <span className="stat-summary-num">{stats.done}</span>
            <span className="checklist-total">/ {stats.total}</span>
            <span className="stat-summary-sub">завршени</span>
          </div>
          <div className="stat-summary-headline-secondary">
            <div className="stat-summary-stat">
              <span className="stat-summary-num">{stats.open}</span>
              <span className="stat-summary-sub">отворени</span>
            </div>
          </div>
        </div>

        <div role="img" aria-label={`Чеклиста: завршено ${donePct}%, отворено ${openPct}%`} className="stat-summary-bar">
          {donePct > 0 ? <div style={{ flexGrow: donePct, flexBasis: 0, background: "#c9a24a" }} /> : null}
          {openPct > 0 ? <div style={{ flexGrow: openPct, flexBasis: 0, background: "#d8cbb0" }} /> : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2" style={{ alignItems: "start" }}>
        <div className="panel couple-card">
          <div className="panel-h" style={{ justifyContent: "space-between" }}>
            <h2 className="panel-t">Задачи</h2>
            <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{stats.open} отворени</span>
          </div>
          <div>
            {items.length === 0 ? <p className="checklist-empty">Сè уште нема додадени задачи.</p> : null}
            {items.map((item) => {
              const today = todayIn();
              const isOverdue = !item.is_done && item.due_date !== null && item.due_date < today;
              return editingId === item.id ? (
                <div key={item.id} className="checklist-edit-row">
                  <input className="fld" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <input className="fld" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
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
                <div key={item.id} className="checklist-row">
                  <div className="checklist-row-head">
                    <div className="checklist-row-main">
                      <input type="checkbox" checked={item.is_done} onChange={() => handleToggle(item)} aria-label={item.title} />
                      <div>
                        <p className={`checklist-title${item.is_done ? " is-done" : ""}`}>{item.title}</p>
                        {item.due_date ? (
                          <p className={`checklist-due${isOverdue ? " is-overdue" : ""}`}>
                            Рок {formatMkDate(item.due_date)}
                            {isOverdue ? <span style={{ marginLeft: 8, fontWeight: 700 }}>Задоцнето</span> : null}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="checklist-row-actions">
                      <button type="button" onClick={() => startEdit(item)} aria-label={`Измени ${item.title}`} className="checklist-link">
                        Измени
                      </button>
                      <button type="button" onClick={() => handleDelete(item.id)} aria-label={`Избриши ${item.title}`} className="checklist-link checklist-link-danger">
                        Избриши
                      </button>
                    </div>
                  </div>
                  <SubtaskList item={item} onChanged={refresh} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel couple-card">
          <div className="panel-h">
            <h2 className="panel-t">
              <Icon name="plus" size="sm" /> Додади задача
            </h2>
          </div>
          <form onSubmit={handleAdd} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label className="lab-s" htmlFor="checklist-title">
                Наслов на задачата
              </label>
              <input id="checklist-title" className="fld" placeholder="пр. Нарачај торта" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label className="lab-s" htmlFor="checklist-due-date">
                Рок (опционално)
              </label>
              <input id="checklist-due-date" className="fld" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
            <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
              {isSubmitting ? "Се додава..." : "Додади задача"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
