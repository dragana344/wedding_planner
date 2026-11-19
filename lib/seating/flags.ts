// Seated guests whose answer no longer matches their seats (group B task 3,
// decision 6): they declined, or their party is now smaller than the seats
// they hold. Pure, so the couple's server read, the venue's browser read and
// the tests share it.

import type { Seat, SeatTable } from "./types";

/** A seated guest as the flags need them: answer, party size and seats held event-wide. */
export interface SeatFlagGuest {
  id: string;
  fullName: string;
  rsvpStatus: string;
  partySize: number;
  seatsTaken: number;
}

export interface SeatFlag {
  guestId: string;
  fullName: string;
  kind: "declined" | "over";
  /** Seats held beyond the party (all of them for a declined guest). */
  extra: number;
  /** "Одбил — ослободете ги местата" / "3 места повеќе на маса 5". */
  text: string;
}

const places = (n: number) => (n === 1 ? "1 место" : `${n} места`);

/** "маса 5", or the table's own label. */
function tableName(t: Pick<SeatTable, "label" | "number">): string {
  return t.label ?? `маса ${t.number}`;
}

/**
 * The flags for one room's plan: every seated guest (event-wide) who declined
 * or holds more seats than their party, with where they sit in this room. By
 * name.
 */
export function seatFlags(guests: readonly SeatFlagGuest[], seats: readonly Seat[], tables: readonly SeatTable[]): SeatFlag[] {
  const byElement = new Map(tables.map((t) => [t.elementId, t]));
  const flags: SeatFlag[] = [];
  for (const g of guests) {
    if (g.seatsTaken <= 0) continue;
    const here = [...new Set(seats.filter((s) => s.guestId === g.id).map((s) => s.elementId))]
      .map((id) => byElement.get(id))
      .filter((t): t is SeatTable => Boolean(t))
      .sort((a, b) => a.number - b.number)
      .map(tableName);
    const where = here.length > 0 ? ` на ${here.join(", ")}` : "";
    if (g.rsvpStatus === "declined") {
      flags.push({ guestId: g.id, fullName: g.fullName, kind: "declined", extra: g.seatsTaken, text: `Одбил — ослободете ги местата${where}` });
    } else if (g.seatsTaken > g.partySize) {
      const extra = g.seatsTaken - g.partySize;
      flags.push({ guestId: g.id, fullName: g.fullName, kind: "over", extra, text: `${places(extra)} повеќе${where}` });
    }
  }
  return flags.sort((a, b) => a.fullName.localeCompare(b.fullName, "mk"));
}

/** "2 гости на распоредот треба да се проверат" — the summary above the plan. */
export function seatFlagsSummary(count: number): string {
  return count === 1 ? "1 гостин на распоредот треба да се провери" : `${count} гости на распоредот треба да се проверат`;
}
