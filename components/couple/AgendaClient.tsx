"use client";

import { useState } from "react";
import { Cormorant_Garamond } from "next/font/google";
import type { AgendaItem } from "@/lib/couple/agenda";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { formatMkDate } from "@/lib/date";
import { Icon } from "@/components/venue/shell/Icon";
import "@/components/couple/InvitationCard.css";
import "./AgendaClient.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: "400" });

export function AgendaClient({ initialItems, coupleNames, eventDate }: { initialItems: AgendaItem[]; coupleNames: string; eventDate: string }) {
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
      // Same place the server gave it: in front of the first item that starts later.
      setItems((prev) => {
        const at = created.time ? prev.findIndex((i) => i.time !== null && i.time.slice(0, 5) > created.time.slice(0, 5)) : -1;
        return at === -1 ? [...prev, created] : [...prev.slice(0, at), created, ...prev.slice(at)];
      });
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
    <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2" style={{ alignItems: "start" }}>
      <div className="panel couple-card">
        <div className="panel-h">
          <h2 className="panel-t">
            <Icon name="plus" size="sm" /> Додај точка
          </h2>
        </div>
        <form onSubmit={handleAdd} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="lab-s" htmlFor="agenda-time">
              Време
            </label>
            <input id="agenda-time" type="time" className="fld" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <label className="lab-s" htmlFor="agenda-title">
              Наслов
            </label>
            <input id="agenda-title" className="fld" placeholder="пр. Прв танц" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="lab-s" htmlFor="agenda-notes">
              Белешки (опционално)
            </label>
            <input id="agenda-notes" className="fld" placeholder="Место, детали..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
          <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
            {isSubmitting ? "Се додава..." : "Додади"}
          </button>
        </form>
      </div>

      <div className="panel couple-card invite-card">
        <div className="invite-frame">
          <h2 className={`invite-title ${cormorant.className}`}>Агенда</h2>
          <p className="invite-sub">
            {coupleNames} · {formatMkDate(eventDate)}
          </p>
          <div className="invite-divider">
            <span className="invite-diamond" />
          </div>

          {items.length === 0 ? <p className="agenda-empty">Сè уште нема испланирано ништо.</p> : null}

          {items.map((item, idx) =>
            editingId === item.id ? (
              <div key={item.id} className="agenda-edit-row">
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
              <div key={item.id} className="agenda-row">
                <span className={`agenda-time ${cormorant.className}`}>{item.time ? item.time.slice(0, 5) : "—"}</span>
                <span className="agenda-dot" />
                <div className="agenda-content">
                  <p className="agenda-title">{item.title}</p>
                  {item.notes ? <p className="agenda-notes">{item.notes}</p> : null}
                </div>
                <div className="agenda-actions">
                  <button type="button" onClick={() => handleMove(item.id, "up")} disabled={idx === 0} aria-label="Помести нагоре" className="agenda-icon-btn">
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(item.id, "down")}
                    disabled={idx === items.length - 1}
                    aria-label="Помести надолу"
                    className="agenda-icon-btn"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => startEdit(item)} className="agenda-link">
                    Измени
                  </button>
                  <button type="button" onClick={() => handleDelete(item.id)} className="agenda-link agenda-link-danger">
                    Избриши
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
