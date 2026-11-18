import { todayIn } from "@/lib/date";

// The couple's access life cycle (migration 0170): full access until the
// event day (inclusive, Skopje date), then read-only "memories", then closed
// — the retention cron erases the event's personal data the day after the
// end. Mirrors the SQL rule in public.event_access_end / due_retention_event_ids (0178).

/** Months after the event date when couple access ends by default. */
export const COUPLE_ACCESS_MONTHS = 6;

export type CoupleAccessPhase = "active" | "memories" | "closed";

/**
 * The explicit end date stored on the event, if any: an admin extension wins
 * over the cancellation date (see the 0170 header). Pass the result to
 * {@link coupleAccessEnd} / {@link coupleAccessPhase}.
 */
export function coupleAccessUntil(event: { couple_access_until: string | null; couple_access_extended_until: string | null }): string | null {
  return event.couple_access_extended_until ?? event.couple_access_until;
}

/** "YYYY-MM-DD" plus whole months, clamped to the month's last day like Postgres `date + interval`. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/** Last day ("YYYY-MM-DD") the couple can still open the event. */
export function coupleAccessEnd(eventDate: string, accessUntil: string | null): string {
  return accessUntil ? accessUntil.slice(0, 10) : addMonths(eventDate, COUPLE_ACCESS_MONTHS);
}

/** Where the couple is in the life cycle on `today` (Skopje date by default). */
export function coupleAccessPhase(eventDate: string, accessUntil: string | null, today: string = todayIn()): CoupleAccessPhase {
  const end = coupleAccessEnd(eventDate, accessUntil);
  // A cancellation can end access before the event day: closed wins.
  if (today > end) return "closed";
  if (today <= eventDate.slice(0, 10)) return "active";
  return "memories";
}

/** The event columns the phase is computed from (one row of public.events). */
export type CoupleAccessRow = {
  event_date: string;
  couple_access_until: string | null;
  couple_access_extended_until: string | null;
  personal_data_erased_at: string | null;
};

/** The phase of an event row; an erased event is always closed. */
export function eventAccessPhase(event: CoupleAccessRow, today: string = todayIn()): CoupleAccessPhase {
  if (event.personal_data_erased_at) return "closed";
  return coupleAccessPhase(event.event_date, coupleAccessUntil(event), today);
}

/**
 * Set by proxy.ts on every couple request from the validated session
 * ("active" or "memories"; a closed event never gets a session). Never
 * trusted from the browser: proxy.ts deletes any incoming copy first.
 */
export const COUPLE_ACCESS_PHASE_HEADER = "x-couple-access-phase";

/** `?reason=` on /couple/login when proxy.ts ends a closed event's session. */
export const ACCESS_CLOSED_REASON = "closed";

/** Login refusal / ended session, once access has closed. */
export const ACCESS_CLOSED_MESSAGE = "Пристапот до овој настан заврши. За прашања контактирајте го локалот.";

/**
 * The "Преземи ја вашата свадба" page (group A task 7): the wedding book,
 * the spreadsheets and the photos. The read-only banner and the home page
 * link here.
 */
export const COUPLE_DOWNLOADS_HREF = "/couple/download";

/** Write refused during the read-only "memories" period. */
export const READ_ONLY_MESSAGE = "Настанот заврши — податоците се само за преглед и преземање.";
