"use client";

import { useState } from "react";
import type { Guest, GuestSide, GuestStats, RsvpStatus } from "@/lib/couple/guests";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { Icon } from "@/components/venue/shell/Icon";

const STATUS_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: "invited", label: "Поканет" },
  { value: "pending", label: "Во исчекување" },
  { value: "confirmed", label: "Потврден" },
  { value: "declined", label: "Одбиен" },
];

const SIDE_OPTIONS: { value: GuestSide; label: string }[] = [
  { value: "bride", label: "Страна на невестата" },
  { value: "groom", label: "Страна на младоженецот" },
];

export function GuestsClient({
  initialGuests,
  initialStats,
  eventType,
}: {
  initialGuests: Guest[];
  initialStats: GuestStats;
  eventType: string;
}) {
  const isWedding = eventType === "wedding";

  const [guests, setGuests] = useState(initialGuests);
  const [stats, setStats] = useState(initialStats);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [notes, setNotes] = useState("");
  const [side, setSide] = useState<GuestSide>("bride");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refreshStats() {
    const data = await jsonOrThrow(await fetch("/api/couple/guests"));
    setStats(data.stats);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await jsonOrThrow(
        await fetch("/api/couple/guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName,
            phone: phone || null,
            party_size: Number(partySize),
            notes: notes || null,
            side: isWedding ? side : null,
          }),
        })
      );
      setGuests((prev) => [...prev, created]);
      setFullName("");
      setPhone("");
      setPartySize("1");
      setNotes("");
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на гостинот.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(guestId: string, status: RsvpStatus) {
    setError(null);
    try {
      const updated = await jsonOrThrow(
        await fetch(`/api/couple/guests/${guestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "status", rsvp_status: status }),
        })
      );
      setGuests((prev) => prev.map((g) => (g.id === guestId ? updated : g)));
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на статусот.");
    }
  }

  async function handleSideChange(guestId: string, newSide: GuestSide) {
    setError(null);
    try {
      const updated = await jsonOrThrow(
        await fetch(`/api/couple/guests/${guestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "side", side: newSide }),
        })
      );
      setGuests((prev) => prev.map((g) => (g.id === guestId ? updated : g)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа преместувањето на гостинот.");
    }
  }

  async function handleDelete(guestId: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/guests/${guestId}`, { method: "DELETE" }));
      setGuests((prev) => prev.filter((g) => g.id !== guestId));
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на гостинот.");
    }
  }

  function renderGuestRow(guest: Guest) {
    return (
      <div key={guest.id} className="ev" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontWeight: 700, margin: 0 }}>{guest.full_name}</p>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>
            {guest.phone ?? "Нема телефон"} · {guest.party_size} {guest.party_size === 1 ? "гостин" : "гости"}
          </p>
          {guest.notes ? <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>{guest.notes}</p> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label htmlFor={`status-${guest.id}`} className="sr-only">
            Статус за {guest.full_name}
          </label>
          <select
            id={`status-${guest.id}`}
            aria-label={`Статус за ${guest.full_name}`}
            className="fld"
            value={guest.rsvp_status}
            onChange={(e) => handleStatusChange(guest.id, e.target.value as RsvpStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {isWedding ? (
            <button
              type="button"
              onClick={() => handleSideChange(guest.id, guest.side === "bride" ? "groom" : "bride")}
              aria-label={`Премести ${guest.full_name} на другата страна`}
              className="btn btn-ghost"
            >
              Премести на страната на {guest.side === "bride" ? "младоженецот" : "невестата"}
            </button>
          ) : null}
          <button type="button" onClick={() => handleDelete(guest.id)} aria-label={`Избриши ${guest.full_name}`} className="btn btn-ghost" style={{ color: "var(--bad)" }}>
            Избриши
          </button>
        </div>
      </div>
    );
  }

  const brideGuests = guests.filter((g) => g.side === "bride");
  const groomGuests = guests.filter((g) => g.side === "groom");
  const unassignedGuests = guests.filter((g) => g.side === null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="tiles">
        {[
          { label: "Вкупно", value: stats.total, icon: "users" },
          { label: "Потврдени", value: stats.confirmed, icon: "tick" },
          { label: "Одбиени", value: stats.declined, icon: "x" },
          { label: "Во исчекување", value: stats.pending, icon: "clock" },
          { label: "Присутни", value: stats.totalAttending, icon: "occ" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="tile">
            <span className="badge"><Icon name={icon} size="lg" /></span>
            <div>
              <div className="num">{value}</div>
              <div className="lab">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {isWedding ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="panel-t">Страна на невестата</h2>
            {brideGuests.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13.5 }}>Сè уште нема додадено гости.</p>
            ) : (
              brideGuests.map(renderGuestRow)
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="panel-t">Страна на младоженецот</h2>
            {groomGuests.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13.5 }}>Сè уште нема додадено гости.</p>
            ) : (
              groomGuests.map(renderGuestRow)
            )}
          </div>
          {unassignedGuests.length > 0 ? (
            <div className="sm:col-span-2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="panel-t">Недоделени</h2>
              {unassignedGuests.map(renderGuestRow)}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{guests.map(renderGuestRow)}</div>
      )}

      <form onSubmit={handleAdd} className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="fld" placeholder="Име и презиме" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input className="fld" placeholder="Телефон (опционално)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="fld" type="number" min={1} value={partySize} onChange={(e) => setPartySize(e.target.value)} />
        <input className="fld" placeholder="Белешки (опционално)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {isWedding ? (
          <select aria-label="Страна" className="fld" value={side} onChange={(e) => setSide(e.target.value as GuestSide)}>
            {SIDE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}
        {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
          {isSubmitting ? "Се додава..." : "Додади гостин"}
        </button>
      </form>
    </div>
  );
}
