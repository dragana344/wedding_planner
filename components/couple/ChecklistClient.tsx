"use client";

import { useState } from "react";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import type { ChecklistItem, ChecklistStats, ChecklistSubtask } from "@/lib/couple/checklist";

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
    <div style={{ marginTop: 10, paddingLeft: 32, display: "flex", flexDirection: "column", gap: 6 }}>
      {item.subtasks.map((subtask) => (
        <div key={subtask.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={subtask.is_done}
            onChange={() => handleToggle(subtask)}
            aria-label={subtask.title}
          />
          <span style={{ fontSize: 13.5, flex: 1, opacity: subtask.is_done ? 0.55 : 1, textDecoration: subtask.is_done ? "line-through" : "none" }}>
            {subtask.title}
          </span>
          <button
            type="button"
            onClick={() => handleDelete(subtask.id)}
            aria-label={`Избриши ${subtask.title}`}
            className="btn btn-ghost"
            style={{ color: "var(--bad)", padding: "2px 8px" }}
          >
            ×
          </button>
        </div>
      ))}
      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8 }}>
        <input
          className="fld"
          placeholder="Додади опција или подзадача..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          style={{ fontSize: 13.5 }}
        />
        <button type="submit" disabled={isSubmitting} className="btn btn-ghost" style={{ padding: "4px 12px" }}>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ev">
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
          {stats.open === 0
            ? "Сè е завршено"
            : `${stats.open} отворени${stats.overdue > 0 ? ` · ${stats.overdue} задоцнети` : ""}${
                stats.done > 0 ? ` · ${stats.done} завршени` : ""
              }`}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => {
          const today = new Date().toISOString().slice(0, 10);
          const isOverdue = !item.is_done && item.due_date !== null && item.due_date < today;
          return (
          <div key={item.id} className="ev" style={item.is_done ? { opacity: 0.55 } : undefined}>
            {editingId === item.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="checkbox"
                    checked={item.is_done}
                    onChange={() => handleToggle(item)}
                    aria-label={item.title}
                  />
                  <div>
                    <p style={{ fontWeight: 700, margin: 0 }}>{item.title}</p>
                    {item.due_date ? (
                      <p style={{ margin: 0, fontSize: 13.5, color: isOverdue ? "var(--bad)" : "var(--muted)" }}>
                        Рок {item.due_date}
                        {isOverdue ? <span style={{ marginLeft: 8, fontWeight: 700 }}>Задоцнето</span> : null}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => startEdit(item)} aria-label={`Измени ${item.title}`} className="btn btn-ghost">
                    Измени
                  </button>
                  <button type="button" onClick={() => handleDelete(item.id)} aria-label={`Избриши ${item.title}`} className="btn btn-ghost" style={{ color: "var(--bad)" }}>
                    Избриши
                  </button>
                </div>
              </div>
            )}
            {editingId === item.id ? null : <SubtaskList item={item} onChanged={refresh} />}
          </div>
          );
        })}
      </div>

      <form onSubmit={handleAdd} className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="fld" placeholder="Наслов на задачата" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input className="fld" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
          {isSubmitting ? "Се додава..." : "Додади задача"}
        </button>
      </form>
    </div>
  );
}
