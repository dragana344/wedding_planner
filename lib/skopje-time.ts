// Wall-clock time in Skopje for <input type="datetime-local">, whatever time
// zone the browser is in (a couple abroad still schedules in Macedonian time).
import { VENUE_TIME_ZONE } from "@/lib/date";

/** Minutes Skopje is ahead of UTC at this instant (60 in winter, 120 in summer). */
function offsetMinutes(utcMs: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: VENUE_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((wall - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/** "2027-07-05T10:00" in Skopje → "2027-07-05T08:00:00.000Z". */
export function skopjeLocalToIso(local: string): string {
  const [date, time] = local.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  let utc = asUtc - offsetMinutes(asUtc) * 60_000;
  // Re-check with the offset at the result (matters around a DST change).
  const again = asUtc - offsetMinutes(utc) * 60_000;
  if (again !== utc) utc = again;
  return new Date(utc).toISOString();
}

/** A UTC instant → "YYYY-MM-DDTHH:mm" on the Skopje wall clock. */
export function isoToSkopjeLocal(iso: string): string {
  const ms = new Date(iso).getTime();
  return new Date(ms + offsetMinutes(ms) * 60_000).toISOString().slice(0, 16);
}
