"use client";

import { useState } from "react";

export interface SeatView {
  table_label: string | null;
  seat_number: number | null;
  room_name: string | null;
}

/** "Маса 5, столче 3 · Сала Лотос" */
export function seatText(seat: SeatView): string {
  const table = [seat.table_label, seat.seat_number !== null ? `столче ${seat.seat_number}` : null].filter(Boolean).join(", ");
  return [table, seat.room_name].filter(Boolean).join(" · ");
}

/** A16: on the shared link, a guest finds their table by name. */
export function SeatFinder({ slug, color, lineColor }: { slug: string; color: string; lineColor: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ seat: SeatView | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${slug}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не успеа пребарувањето. Обидете се повторно.");
        setResult(null);
        return;
      }
      setResult({ seat: data.seat ?? null });
    } catch {
      setError("Не успеа пребарувањето. Обидете се повторно.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={find} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 340, margin: "0 auto" }}>
      <label htmlFor="seat-name" style={{ fontSize: 16, color }}>
        Вашето име (како на поканата)
      </label>
      <input
        id="seat-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoComplete="name"
        style={{ padding: "10px 12px", fontSize: 16, borderRadius: 10, border: `1px solid ${lineColor}`, background: "#fff", color: "#222" }}
      />
      <button
        type="submit"
        disabled={busy}
        style={{ minHeight: 44, borderRadius: 10, border: `1px solid ${lineColor}`, background: "transparent", color, fontSize: 16, cursor: "pointer" }}
      >
        Најди ја мојата маса
      </button>
      {result ? (
        <p role="status" style={{ margin: 0, fontSize: 18, color }}>
          {result.seat ? `Вашето место: ${seatText(result.seat)}` : "Не најдовме маса за тоа име. Можеби распоредот уште не е готов; проверете како е напишано името или прашајте ги домаќините."}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 15, color }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
