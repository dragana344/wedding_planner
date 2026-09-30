"use client";

import { useMemo, useState } from "react";
import { tableTitle, type Seat, type SeatGuest, type SeatInput, type SeatTable } from "@/lib/seating/types";

interface Row {
  guestId: string | null;
  text: string;
}

function rowsFrom(table: SeatTable, seats: Seat[]): Row[] {
  const rows: Row[] = Array.from({ length: table.capacity }, () => ({ guestId: null, text: "" }));
  for (const s of seats) {
    if (s.seatNumber >= 1 && s.seatNumber <= table.capacity) {
      rows[s.seatNumber - 1] = { guestId: s.guestId, text: s.displayName };
    }
  }
  return rows;
}

const MAX_SUGGESTIONS = 8;

/**
 * One table's seat list: seats 1..capacity, each a guest from the list
 * (autocomplete offers only guests with a free seat left) or free text.
 * Rows can be dragged onto another seat (the two swap). Nothing is written
 * until "Зачувај".
 */
export function TableSeatsPanel({
  table,
  seats,
  guests,
  onSave,
  onClose,
  readOnly = false,
}: {
  table: SeatTable;
  seats: Seat[];
  guests: SeatGuest[];
  onSave: (seats: SeatInput[]) => Promise<void>;
  onClose?: () => void;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(table, seats));
  const [openSeat, setOpenSeat] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const guestById = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);

  // Seats each guest holds at other tables = event-wide count minus the ones
  // loaded for this table; local edits then add to that.
  const elsewhere = useMemo(() => {
    const here = new Map<string, number>();
    for (const s of seats) if (s.guestId) here.set(s.guestId, (here.get(s.guestId) ?? 0) + 1);
    return new Map(guests.map((g) => [g.id, g.seatsTaken - (here.get(g.id) ?? 0)]));
  }, [guests, seats]);

  const localCount = new Map<string, number>();
  for (const r of rows) if (r.guestId) localCount.set(r.guestId, (localCount.get(r.guestId) ?? 0) + 1);
  const held = (id: string) => (elsewhere.get(id) ?? 0) + (localCount.get(id) ?? 0);

  const filled = rows.filter((r) => r.guestId || r.text.trim()).length;
  const overbooked = guests.filter((g) => localCount.has(g.id) && held(g.id) > g.partySize);

  function update(index: number, row: Row) {
    setSaved(false);
    setRows((prev) => prev.map((r, i) => (i === index ? row : r)));
  }

  function suggestions(index: number): SeatGuest[] {
    const query = rows[index].text.trim().toLocaleLowerCase("mk");
    return guests
      .filter((g) => g.id !== rows[index].guestId && held(g.id) < g.partySize)
      .filter((g) => !query || g.fullName.toLocaleLowerCase("mk").includes(query))
      .slice(0, MAX_SUGGESTIONS);
  }

  function drop(target: number) {
    if (dragFrom === null || dragFrom === target) {
      setDragFrom(null);
      return;
    }
    const from = dragFrom;
    setDragFrom(null);
    setSaved(false);
    setRows((prev) => {
      const next = [...prev];
      [next[from], next[target]] = [next[target], next[from]];
      return next;
    });
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await onSave(
        rows.flatMap((r, i): SeatInput[] => {
          const text = r.text.trim();
          if (r.guestId) return [{ seatNumber: i + 1, guestId: r.guestId, guestName: null }];
          return text ? [{ seatNumber: i + 1, guestId: null, guestName: text }] : [];
        }),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на листата.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4" aria-label={`Листа за ${tableTitle(table)}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl text-neutral-900">{tableTitle(table)}</h2>
        <span className="rounded-full bg-lilac-light px-3 py-0.5 text-sm font-medium text-neutral-900">
          {filled}/{table.capacity}
        </span>
        {onClose ? (
          <button type="button" onClick={onClose} className="ml-auto text-sm text-neutral-500 hover:text-neutral-900">
            Затвори
          </button>
        ) : null}
      </div>

      {overbooked.map((g) => (
        <p key={g.id} className="mb-2 text-sm text-amber-700">
          {g.fullName}: повеќе места од бројот на лица ({held(g.id)} / {g.partySize}).
        </p>
      ))}

      <ol className="space-y-1.5">
        {rows.map((row, index) => {
          const seatNumber = index + 1;
          if (readOnly) {
            return (
              <li key={seatNumber} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-right font-medium text-neutral-400">{seatNumber}.</span>
                <span className={row.text ? "text-neutral-900" : "text-neutral-300"}>{row.text || "—"}</span>
              </li>
            );
          }
          const options = openSeat === index ? suggestions(index) : [];
          const linked = row.guestId ? guestById.get(row.guestId) : null;
          return (
            <li
              key={seatNumber}
              data-testid={`seat-row-${seatNumber}`}
              onPointerUp={() => drop(index)}
              className={`relative flex items-center gap-2 rounded-lg px-1 ${dragFrom !== null ? "hover:bg-lilac-light" : ""}`}
            >
              <button
                type="button"
                aria-label={`Премести од столче ${seatNumber}`}
                onPointerDown={(e) => {
                  (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
                  setDragFrom(index);
                }}
                className="cursor-grab touch-none select-none px-1 text-neutral-400"
              >
                ⋮⋮
              </button>
              <label htmlFor={`seat-${table.elementId}-${seatNumber}`} className="w-6 text-right text-sm font-medium text-neutral-500">
                {seatNumber}.
              </label>
              <input
                id={`seat-${table.elementId}-${seatNumber}`}
                aria-label={`Столче ${seatNumber}`}
                value={row.text}
                autoComplete="off"
                maxLength={200}
                onFocus={() => setOpenSeat(index)}
                onBlur={() => setTimeout(() => setOpenSeat((s) => (s === index ? null : s)), 150)}
                onChange={(e) => update(index, { guestId: null, text: e.target.value })}
                className={`flex-1 rounded-lg border px-2 py-1 text-sm ${linked ? "border-lilac-dark" : "border-neutral-200"}`}
              />
              {options.length > 0 ? (
                <ul role="listbox" className="absolute left-16 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-lg border border-neutral-200 bg-white shadow">
                  {options.map((g) => (
                    <li key={g.id} role="option" aria-selected={false}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          update(index, { guestId: g.id, text: g.fullName });
                          setOpenSeat(null);
                        }}
                        className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-lilac-light"
                      >
                        <span>{g.fullName}</span>
                        {g.partySize > 1 ? (
                          <span className="text-neutral-400">
                            {held(g.id)}/{g.partySize}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {!readOnly ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-lilac-dark px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Се зачувува..." : "Зачувај"}
          </button>
          {saved ? <span className="text-sm text-green-700">Зачувано.</span> : null}
        </div>
      ) : null}
    </section>
  );
}
