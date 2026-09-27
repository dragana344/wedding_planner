"use client";

import { useState } from "react";
import type { AgendaItem } from "@/lib/couple/agenda";
import { jsonOrThrow } from "@/lib/couple/client-utils";

export function AgendaClient({ initialItems }: { initialItems: AgendaItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await jsonOrThrow(
        await fetch("/api/couple/agenda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ time: time || null, title, notes: notes || null }),
        })
      );
      setItems((prev) => [...prev, created]);
      setTime("");
      setTitle("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на ставката.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/agenda/${id}`, { method: "DELETE" }));
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на ставката.");
    }
  }

  async function handleMove(id: string, direction: "up" | "down") {
    setError(null);
    try {
      const updated = await jsonOrThrow(
        await fetch(`/api/couple/agenda/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "move", direction }),
        })
      );
      setItems(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа преуредувањето.");
    }
  }

  function startEdit(item: AgendaItem) {
    setError(null);
    setEditingId(item.id);
    setEditTime(item.time ?? "");
    setEditTitle(item.title);
    setEditNotes(item.notes ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(id: string) {
    setError(null);
    setIsSaving(true);
    try {
      const updated = await jsonOrThrow(
        await fetch(`/api/couple/agenda/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ time: editTime || null, title: editTitle, notes: editNotes || null }),
        })
      );
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на ставката.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, idx) =>
        editingId === item.id ? (
          <div key={item.id} className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="time" className="fld" value={editTime} onChange={(e) => setEditTime(e.target.value)} aria-label="Измени време" />
            <input className="fld" placeholder="Наслов" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required aria-label="Измени наслов" />
            <input className="fld" placeholder="Белешки (опционално)" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} aria-label="Измени белешки" />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => handleSaveEdit(item.id)} disabled={isSaving} className="btn btn-gold">
                {isSaving ? "Се зачувува..." : "Зачувај"}
              </button>
              <button type="button" onClick={cancelEdit} disabled={isSaving} className="btn btn-ghost">
                Откажи
              </button>
            </div>
          </div>
        ) : (
          <div key={item.id} className="ev" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              {item.time ? <span style={{ marginRight: 8, color: "var(--muted)", fontSize: 13.5 }}>{item.time}</span> : null}
              <span style={{ fontWeight: 700 }}>{item.title}</span>
              {item.notes ? <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>{item.notes}</p> : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" onClick={() => handleMove(item.id, "up")} disabled={idx === 0} aria-label="Помести нагоре" className="btn btn-ghost">
                ↑
              </button>
              <button type="button" onClick={() => handleMove(item.id, "down")} disabled={idx === items.length - 1} aria-label="Помести надолу" className="btn btn-ghost">
                ↓
              </button>
              <button type="button" onClick={() => startEdit(item)} aria-label="Измени" className="btn btn-ghost">
                Измени
              </button>
              <button type="button" onClick={() => handleDelete(item.id)} aria-label="Избриши" className="btn btn-ghost" style={{ color: "var(--bad)" }}>
                Избриши
              </button>
            </div>
          </div>
        )
      )}

      <form onSubmit={handleAdd} className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input type="time" className="fld" value={time} onChange={(e) => setTime(e.target.value)} />
        <input className="fld" placeholder="Наслов" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input className="fld" placeholder="Белешки (опционално)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
          {isSubmitting ? "Се додава..." : "Додади"}
        </button>
      </form>
    </div>
  );
}
