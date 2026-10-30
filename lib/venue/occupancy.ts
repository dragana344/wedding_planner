import type { EventDetail } from "./events";
import type { Reservation } from "./reservations";

/** Minutes since midnight for a "HH:MM[:SS]" time string. */
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Peak concurrent guests across a set of same-day events.
 *
 * Summing every event's guest count would badly overstate demand — an 11:00
 * lunch and a 19:00 wedding never occupy the same seats. Instead this sweeps
 * the interval endpoints and returns the largest number of guests present at
 * any single moment.
 *
 * Events whose end_time is earlier than their start_time run past midnight and
 * are extended by 24h. Events with no start time cannot be placed on the
 * timeline; they are counted as always-present so they are not silently
 * ignored.
 */
export function peakConcurrentGuests(events: EventDetail[]): number {
  const timed: { start: number; end: number; guests: number }[] = [];
  let untimedGuests = 0;

  for (const ev of events) {
    if (ev.status === "cancelled") continue;
    const guests = ev.guest_count_estimate ?? 0;
    if (guests === 0) continue;

    if (!ev.start_time) {
      untimedGuests += guests;
      continue;
    }
    const start = toMinutes(ev.start_time);
    // Missing end time: assume a nominal 4h block rather than dropping the row.
    let end = ev.end_time ? toMinutes(ev.end_time) : start + 240;
    if (end <= start) end += 24 * 60;
    timed.push({ start, end, guests });
  }

  if (timed.length === 0) return untimedGuests;

  // Sweep: +guests at each start, -guests at each end, tracking the running max.
  const deltas: { at: number; delta: number }[] = [];
  for (const t of timed) {
    deltas.push({ at: t.start, delta: t.guests });
    deltas.push({ at: t.end, delta: -t.guests });
  }
  // Ends sort before starts at the same minute: an event ending at 15:00 has
  // freed its seats before one starting at 15:00 needs them.
  deltas.sort((a, b) => a.at - b.at || a.delta - b.delta);

  let running = 0;
  let peak = 0;
  for (const d of deltas) {
    running += d.delta;
    if (running > peak) peak = running;
  }
  return peak + untimedGuests;
}

/** A single hour's share of a room's tables occupied by a reservation. */
export interface HourOccupancy {
  /** 0-23, local to the day being measured. */
  hour: number;
  reservedTables: number;
  totalTables: number;
  /** Rounded 0-100; 0 when totalTables is 0. */
  pct: number;
}

/** How long a table stays reserved when a booking has no explicit end time — mirrors reservations.ts. */
const DEFAULT_RESERVATION_MINUTES = 180;

/** Reservations in these statuses no longer occupy a table — mirrors reservations.ts. */
const INACTIVE_STATUSES = new Set<Reservation["status"]>(["cancelled", "completed"]);

/** A reservation's [start, end) span in minutes-since-midnight, expanding a missing end time and a midnight crossing. */
function toSpan(startTime: string, endTime: string | null): { s: number; e: number } {
  const [h, m] = startTime.split(":").map(Number);
  const s = h * 60 + m;
  let e: number;
  if (endTime) {
    const [eh, em] = endTime.split(":").map(Number);
    e = eh * 60 + em;
  } else {
    e = s + DEFAULT_RESERVATION_MINUTES;
  }
  if (e <= s) e += 24 * 60;
  return { s, e };
}

/**
 * For every hour of the day (0-23), how many of a room's tables a
 * reservation's time window covers — the data behind the Резервации page's
 * hour-by-hour occupancy slider. A table counts once per hour no matter how
 * many reservations touch it (overlapping bookings on the same table are a
 * data anomaly elsewhere, not something to double-count here).
 */
export function computeHourlyTableOccupancy(reservations: Reservation[], totalTables: number): HourOccupancy[] {
  const active = reservations.filter((r) => !INACTIVE_STATUSES.has(r.status));
  const spans = active.map((r) => ({ ...toSpan(r.start_time, r.end_time), table_ids: r.table_ids }));

  const hours: HourOccupancy[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    const occupied = new Set<string>();
    for (const span of spans) {
      // Check the span itself and shifted ±24h so a booking anchored to the
      // previous or next day's clock (e.g. 23:00-01:00) still covers the
      // hours it actually spans today.
      const covers = [-24 * 60, 0, 24 * 60].some((shift) => hourStart < span.e + shift && hourEnd > span.s + shift);
      if (covers) {
        for (const id of span.table_ids) occupied.add(id);
      }
    }
    const reservedTables = occupied.size;
    hours.push({
      hour,
      reservedTables,
      totalTables,
      pct: totalTables > 0 ? Math.round((reservedTables / totalTables) * 100) : 0,
    });
  }
  return hours;
}
