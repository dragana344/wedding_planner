"use client";

import { useState } from "react";
import type { Guest, GuestSide, GuestStats, RsvpStatus } from "@/lib/couple/guests";
import { jsonOrThrow } from "@/lib/couple/client-utils";

const STATUS_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: "invited", label: "Invited" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
];

const SIDE_OPTIONS: { value: GuestSide; label: string }[] = [
  { value: "bride", label: "Bride's side" },
  { value: "groom", label: "Groom's side" },
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
      setError(err instanceof Error ? err.message : "Failed to add guest.");
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
      setError(err instanceof Error ? err.message : "Failed to update status.");
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
      setError(err instanceof Error ? err.message : "Failed to move guest.");
    }
  }

  async function handleDelete(guestId: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/guests/${guestId}`, { method: "DELETE" }));
      setGuests((prev) => prev.filter((g) => g.id !== guestId));
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete guest.");
    }
  }

  function renderGuestRow(guest: Guest) {
    return (
      <div key={guest.id} className="ev" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontWeight: 700, margin: 0 }}>{guest.full_name}</p>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>
            {guest.phone ?? "No phone"} · {guest.party_size} {guest.party_size === 1 ? "guest" : "guests"}
          </p>
          {guest.notes ? <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>{guest.notes}</p> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label htmlFor={`status-${guest.id}`} className="sr-only">
            Status for {guest.full_name}
          </label>
          <select
            id={`status-${guest.id}`}
            aria-label={`Status for ${guest.full_name}`}
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
              aria-label={`Move ${guest.full_name} to the other side`}
              className="btn btn-ghost"
            >
              Move to {guest.side === "bride" ? "groom's" : "bride's"} side
            </button>
          ) : null}
          <button type="button" onClick={() => handleDelete(guest.id)} aria-label={`Delete ${guest.full_name}`} className="btn btn-ghost" style={{ color: "var(--bad)" }}>
            Delete
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
          ["Total", stats.total],
          ["Confirmed", stats.confirmed],
          ["Declined", stats.declined],
          ["Pending", stats.pending],
          ["Attending", stats.totalAttending],
        ].map(([label, value]) => (
          <div key={label as string} className="tile">
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
            <h2 className="panel-t">Bride&apos;s side</h2>
            {brideGuests.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13.5 }}>No guests added yet.</p>
            ) : (
              brideGuests.map(renderGuestRow)
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="panel-t">Groom&apos;s side</h2>
            {groomGuests.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13.5 }}>No guests added yet.</p>
            ) : (
              groomGuests.map(renderGuestRow)
            )}
          </div>
          {unassignedGuests.length > 0 ? (
            <div className="sm:col-span-2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="panel-t">Unassigned</h2>
              {unassignedGuests.map(renderGuestRow)}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{guests.map(renderGuestRow)}</div>
      )}

      <form onSubmit={handleAdd} className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="fld" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input className="fld" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="fld" type="number" min={1} value={partySize} onChange={(e) => setPartySize(e.target.value)} />
        <input className="fld" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {isWedding ? (
          <select aria-label="Side" className="fld" value={side} onChange={(e) => setSide(e.target.value as GuestSide)}>
            {SIDE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}
        {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
          {isSubmitting ? "Adding..." : "Add guest"}
        </button>
      </form>
    </div>
  );
}
