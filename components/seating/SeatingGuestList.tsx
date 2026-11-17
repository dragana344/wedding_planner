"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { tableTitle, type RoomSeating } from "@/lib/seating/types";

/** The couple's seating on a phone, from the guests' side: who still needs a
 * seat and where everyone sits. Tapping a guest asks for a table (no drag). */
export function SeatingGuestList({
  seating,
  onPick,
  readOnly = false,
}: {
  seating: RoomSeating;
  onPick: (guestId: string) => void;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [onlyUnseated, setOnlyUnseated] = useState(false);

  const tablesOf = useMemo(() => {
    const titleById = new Map(seating.tables.map((t) => [t.elementId, tableTitle(t)]));
    const map = new Map<string, string[]>();
    for (const s of seating.seats) {
      if (!s.guestId) continue;
      const title = titleById.get(s.elementId);
      if (!title) continue;
      const list = map.get(s.guestId) ?? [];
      if (!list.includes(title)) list.push(title);
      map.set(s.guestId, list);
    }
    return map;
  }, [seating]);

  const unseatedCount = seating.guests.filter((g) => g.seatsTaken < g.partySize).length;
  const q = query.trim().toLocaleLowerCase("mk");
  const shown = seating.guests.filter(
    (g) => (!onlyUnseated || g.seatsTaken < g.partySize) && (!q || g.fullName.toLocaleLowerCase("mk").includes(q)),
  );

  return (
    <section className="cs-card cs-glist" aria-label="Гости по маси">
      <label className="cs-search">
        <Icon name="search" size="sm" className="cs-search-ic" />
        <input type="search" placeholder="Пребарај гостин..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Пребарај гостин" />
      </label>
      <label className="cs-glist-filter">
        <input type="checkbox" checked={onlyUnseated} onChange={(e) => setOnlyUnseated(e.target.checked)} />
        Само без место ({unseatedCount})
      </label>
      <ul className="cs-glist-rows">
        {shown.map((g) => {
          const done = g.seatsTaken >= g.partySize;
          const where = tablesOf.get(g.id) ?? [];
          return (
            <li key={g.id}>
              <button
                type="button"
                className={`cs-glist-row${done ? " is-done" : ""}`}
                onClick={() => onPick(g.id)}
                disabled={readOnly}
                aria-label={`${g.fullName}: ${g.seatsTaken} од ${g.partySize} места${where.length ? `, ${where.join(", ")}` : ""}. Избери маса`}
              >
                <span className="cs-glist-main">
                  <span className="cs-glist-name">{g.fullName}</span>
                  <span className="cs-glist-where">{where.length ? where.join(", ") : "Нема место"}</span>
                </span>
                <span className={`cs-glist-count${done ? "" : " is-open"}`}>
                  {g.seatsTaken}/{g.partySize}
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 ? <li className="cs-guest-empty">Нема гости.</li> : null}
      </ul>
    </section>
  );
}
