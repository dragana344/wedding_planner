// Pure logic for the couple dashboard's "Вашиот настан" hero card: splitting
// the couple names for the gold "&"/"и", and the live countdown's target
// instants and phase. No Date-object ambiguity for "now": only the instant
// comparisons in heroPhase() look at the current time, and that's the
// caller's job (component ticks it, tests pass a fixed `now`).
import { skopjeLocalToIso } from "@/lib/skopje-time";

/** "Ивана и Марко" → the two names with the conjunction isolated, so it can
 * be styled on its own (gold italic). Null when no "и"/"&" is found — the
 * caller then shows the string as-is. */
export function splitCoupleNames(names: string): { first: string; sep: string; second: string } | null {
  const match = /^(.+?)\s+(и|&)\s+(.+)$/i.exec(names.trim());
  if (!match) return null;
  return { first: match[1], sep: match[2], second: match[3] };
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The event's start as a real instant. No start_time recorded yet is read
 * as midnight on the Skopje wall clock, so there's always a countdown target. */
export function eventStartInstant(eventDate: string, startTime: string | null): Date {
  const time = startTime ? startTime.slice(0, 5) : "00:00";
  return new Date(skopjeLocalToIso(`${eventDate}T${time}`));
}

/** The event's end as a real instant. No end_time: the event is treated as
 * running until midnight after the event date. An end_time at or before
 * start_time (lib/venue/occupancy.ts's convention) runs past midnight, into
 * the next day. */
export function eventEndInstant(eventDate: string, startTime: string | null, endTime: string | null): Date {
  if (!endTime) return new Date(skopjeLocalToIso(`${addDays(eventDate, 1)}T00:00`));
  const start = startTime ? startTime.slice(0, 5) : "00:00";
  const end = endTime.slice(0, 5);
  const day = end <= start ? addDays(eventDate, 1) : eventDate;
  return new Date(skopjeLocalToIso(`${day}T${end}`));
}

export type HeroPhase =
  | { kind: "countdown"; days: number; hours: number; minutes: number }
  | { kind: "today" }
  | { kind: "past" };

/** Which of the three states the hero card shows: counting down, in
 * progress ("Денес е вашиот ден"), or over ("Честитки, младенци!"). */
export function heroPhase(now: Date, start: Date, end: Date): HeroPhase {
  const ms = start.getTime() - now.getTime();
  if (ms > 0) {
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    return { kind: "countdown", days, hours, minutes };
  }
  return now.getTime() < end.getTime() ? { kind: "today" } : { kind: "past" };
}
