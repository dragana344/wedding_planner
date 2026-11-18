"use client";

import { useState } from "react";
import { Cormorant_Garamond } from "next/font/google";
import type { AgendaItem } from "@/lib/couple/agenda";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { formatMkDate } from "@/lib/date";
import { Icon } from "@/components/venue/shell/Icon";
import { AddPanel } from "@/components/shared/AddPanel";
import { TimeInput } from "@/components/shared/TimeInput";
import { AgendaPlaceFields } from "@/components/couple/AgendaPlaceFields";
import { NO_PLACE, type AgendaPlace, type VenueInfo } from "@/lib/couple/agenda-place";
import { mapsHref } from "@/lib/couple/invitation-program";
import "@/components/couple/InvitationCard.css";
import "./AgendaClient.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: "400" });

const placeOf = (item: AgendaItem): AgendaPlace => ({ location: item.location ?? "", address: item.address ?? "", mapUrl: item.map_url ?? "" });
const placeBody = (place: AgendaPlace) => ({ location: place.location || null, address: place.address || null, map_url: place.mapUrl || null });

export function AgendaClient({
  initialItems,
  coupleNames,
  eventDate,
  venue,
}: {
  initialItems: AgendaItem[];
  coupleNames: string;
  eventDate: string;
  venue: VenueInfo;
}) {
  const [items, setItems] = useState(initialItems);
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState<AgendaPlace>(NO_PLACE);
  const [placeKey, setPlaceKey] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editPlace, setEditPlace] = useState<AgendaPlace>(NO_PLACE);
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await jsonOrThrow(
        await fetch("/api/couple/agenda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ time: time || null, title, ...placeBody(place), notes: notes || null }),
        })
      );
      // Same place the server gave it: in front of the first item that starts later.
      setItems((prev) => {
        const at = created.time ? prev.findIndex((i) => i.time !== null && i.time.slice(0, 5) > created.time.slice(0, 5)) : -1;
        return at === -1 ? [...prev, created] : [...prev.slice(0, at), created, ...prev.slice(at)];
      });
      setTime("");
      setTitle("");
      setPlace(NO_PLACE);
      setPlaceKey((k) => k + 1);
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
    if (isMoving) return;
    setError(null);
    const before = items;
    const idx = items.findIndex((i) => i.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= items.length) return;
    // Move it on screen straight away; the server's order replaces it after.
    const next = [...items];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setItems(next);
    setIsMoving(true);
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
      setItems(before);
      setError(err instanceof Error ? err.message : "Не успеа преуредувањето.");
    } finally {
      setIsMoving(false);
    }
  }

  function startEdit(item: AgendaItem) {
    setError(null);
    setEditingId(item.id);
    setEditTime(item.time ?? "");
    setEditTitle(item.title);
    setEditPlace(placeOf(item));
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
          body: JSON.stringify({ time: editTime || null, title: editTitle, ...placeBody(editPlace), notes: editNotes || null }),
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
    <div className="cp-split">
      <AddPanel title="Додај точка" defaultOpen={items.length === 0}>
        <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="lab-s" htmlFor="agenda-time">
              Време
            </label>
            <TimeInput id="agenda-time" className="fld" value={time} onChange={setTime} />
          </div>
          <div>
            <label className="lab-s" htmlFor="agenda-title">
              Наслов
            </label>
            <input id="agenda-title" className="fld" placeholder="пр. Прв танц" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <AgendaPlaceFields key={placeKey} idPrefix="agenda" venue={venue} value={place} onChange={setPlace} />
          <div>
            <label className="lab-s" htmlFor="agenda-notes">
              Белешки (опционално)
            </label>
            <input id="agenda-notes" className="fld" placeholder="Детали..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
          <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
            {isSubmitting ? "Се додава..." : "Додади"}
          </button>
        </form>
      </AddPanel>

      <div className="panel couple-card invite-card agenda-card">
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
                <TimeInput className="fld" value={editTime} onChange={setEditTime} aria-label="Измени време" />
                <input className="fld" placeholder="Наслов" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required aria-label="Измени наслов" />
                <AgendaPlaceFields idPrefix={`agenda-edit-${item.id}`} venue={venue} value={editPlace} onChange={setEditPlace} />
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
                  {item.location || item.address ? (
                    <p className="agenda-location">
                      <Icon name="pin" size="sm" />
                      <span>
                        {[item.location, item.address].filter(Boolean).join(" · ")}
                        {mapsHref({ address: item.address, map_url: item.map_url }) ? (
                          <>
                            {" · "}
                            <a href={mapsHref({ address: item.address, map_url: item.map_url })!} target="_blank" rel="noreferrer" className="agenda-map-link">
                              Мапа
                            </a>
                          </>
                        ) : null}
                      </span>
                    </p>
                  ) : null}
                  {item.notes ? <p className="agenda-notes">{item.notes}</p> : null}
                </div>
                <div className="agenda-actions">
                  <button type="button" onClick={() => handleMove(item.id, "up")} disabled={idx === 0 || isMoving} aria-label="Помести нагоре" className="agenda-icon-btn">
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(item.id, "down")}
                    disabled={idx === items.length - 1 || isMoving}
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
