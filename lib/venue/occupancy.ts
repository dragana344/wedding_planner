import type { EventDetail } from "./events";

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
