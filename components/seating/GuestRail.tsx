"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import type { SeatGuest } from "@/lib/seating/types";

/**
 * The seating page's guest rail (fix #2): every confirmed guest, in the same
 * order the organizer's own Guests page uses (event_guests.created_at —
 * entered group by group, not alphabetically). Drag a row onto a seat in the
 * selected table's panel to seat them there; the assignment saves
 * immediately, no separate "Зачувај" step.
 */
export function GuestRail({
  guests,
  onDragStart,
  draggingGuestId,
  variant = "default",
}: {
  guests: SeatGuest[];
  onDragStart: (guestId: string) => void;
  draggingGuestId: string | null;
  /** "couple": the ivory/gold sidebar look (couple-seating.css), no own heading — the sidebar's tab names it. */
  variant?: "default" | "couple";
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("mk");
    return q ? guests.filter((g) => g.fullName.toLocaleLowerCase("mk").includes(q)) : guests;
  }, [guests, query]);

  if (variant === "couple") {
    return (
      <section className="cs-rail" aria-label="Гости">
        <label className="cs-search">
          <Icon name="search" size="sm" className="cs-search-ic" />
          <input
            type="search"
            placeholder="Пребарај гостин..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Пребарај гостин"
          />
        </label>
        <ol className="cs-guest-list">
          {filtered.map((g) => {
            const seated = g.seatsTaken >= g.partySize;
            return (
              <li
                key={g.id}
                data-testid={`guest-rail-row-${g.id}`}
                className={`cs-guest${draggingGuestId === g.id ? " is-dragging" : ""}${seated ? " is-seated" : ""}`}
              >
                <button
                  type="button"
                  aria-label={`Повлечи ${g.fullName}`}
                  onPointerDown={(e) => {
                    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
                    onDragStart(g.id);
                  }}
                >
                  <Icon name="grip" size="sm" className="cs-guest-grip" />
                  <Icon name="user" size="sm" className="cs-guest-ic" />
                  <span className="cs-guest-name">{g.fullName}</span>
                </button>
                <span className="cs-guest-count">
                  {g.seatsTaken}/{g.partySize}
                </span>
              </li>
            );
          })}
          {filtered.length === 0 ? <li className="cs-guest-empty">Нема гости.</li> : null}
        </ol>
        <p className="cs-hint">
          <Icon name="help" size="sm" className="cs-hint-ic" />
          Повлечете гостин на седиште на избраната маса. Доделувањето се зачувува автоматски.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4" aria-label="Гости">
      <h2 className="mb-2 font-display text-lg text-neutral-900">Гости</h2>
      <input
        type="search"
        placeholder="Пребарај гостин..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Пребарај гостин"
        className="mb-2 w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
      />
      <p className="mb-2 text-xs text-neutral-500">
        Повлечете гостин на седиште на избраната маса. Доделувањето се зачувува автоматски.
      </p>
      <ol className="max-h-72 space-y-1 overflow-auto">
        {filtered.map((g) => {
          const seated = g.seatsTaken >= g.partySize;
          return (
            <li
              key={g.id}
              data-testid={`guest-rail-row-${g.id}`}
              className={`flex items-center justify-between gap-2 rounded-lg px-1 text-sm ${
                draggingGuestId === g.id ? "bg-lilac-light" : ""
              }`}
            >
              <button
                type="button"
                aria-label={`Повлечи ${g.fullName}`}
                onPointerDown={(e) => {
                  (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
                  onDragStart(g.id);
                }}
                className="flex flex-1 cursor-grab touch-none select-none items-center gap-2 py-1.5 text-left"
              >
                <span aria-hidden className="text-neutral-400">
                  ⋮⋮
                </span>
                <span className="text-neutral-900">{g.fullName}</span>
              </button>
              <span className={seated ? "text-neutral-400" : "text-amber-700"}>
                {g.seatsTaken}/{g.partySize}
              </span>
            </li>
          );
        })}
        {filtered.length === 0 ? <li className="py-2 text-sm text-neutral-400">Нема гости.</li> : null}
      </ol>
    </section>
  );
}
