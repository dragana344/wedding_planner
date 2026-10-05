// Calendar dates as the venue sees them (REL-006). `toISOString()` is always
// the UTC date: between local midnight and 01:00/02:00 in Skopje it is still
// "yesterday". Everything that means "today" goes through here.

export const VENUE_TIME_ZONE = "Europe/Skopje";

/** Today's date ("YYYY-MM-DD") in the given time zone, whatever zone this code runs in. */
export function todayIn(timeZone: string = VENUE_TIME_ZONE, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "YYYY-MM-DD" of a Date's own calendar fields (no conversion to UTC). */
export function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MK_MONTHS = ["јануари", "февруари", "март", "април", "мај", "јуни", "јули", "август", "септември", "октомври", "ноември", "декември"];

/** "2026-11-14" → "14 ноември 2026". Anything that is not an ISO date comes back unchanged. */
export function formatMkDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const month = MK_MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : isoDate;
}
