// The guests' answer deadline and the invitation's state (group B task 2,
// migration 0180). Pure and client-safe: the server works out the phase,
// the invitation and the couple's pages only show it.
//
// The venue sets the deadline: a venue-wide "N days before the event"
// (venues.rsvp_deadline_days, default 15 — the day the final menu numbers go
// automatically) that one event can replace with its own date
// (events.rsvp_deadline). Days are calendar days between "YYYY-MM-DD"
// strings, counted in UTC like lib/menu-timeline.ts, so no time zone can
// move a day; "today" is always the venue's (lib/date.ts todayIn).

export const DEFAULT_RSVP_DEADLINE_DAYS = 15;
export const RSVP_DEADLINE_DAYS_MAX = 365;

/** Shown to a guest whose form is closed by the deadline (and sent by the server). */
export const RSVP_DEADLINE_PASSED_ERROR = "Рокот за одговор помина. За промени јавете се на младенците.";
/** After the event: the invitation thanks the guests instead of asking. */
export const RSVP_EVENT_PASSED_MESSAGE = "Ви благодариме што бевте дел од нашиот ден!";
export const RSVP_EVENT_CANCELLED_MESSAGE = "Настанот е откажан.";
/** A per-event deadline after the event itself makes no sense. */
export const RSVP_DEADLINE_AFTER_EVENT_ERROR = "Рокот за одговор не може да биде после датумот на настанот.";

/** "2027-06-12" minus `days` calendar days. */
export function minusDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** The event's own date when it has one, otherwise the venue's "N days before". */
export function effectiveRsvpDeadline(eventDate: string, override: string | null | undefined, defaultDays: number): string {
  return override ? override.slice(0, 10) : minusDays(eventDate, Math.max(0, Math.floor(defaultDays)));
}

/**
 * What the invitation offers today:
 * - "cancelled": the venue cancelled the event — no form;
 * - "after": the event's day has passed — a thank-you, no form;
 * - "closed": past the deadline (the deadline day itself is still open);
 * - "open": guests can answer.
 */
export type InvitationPhase = "open" | "closed" | "after" | "cancelled";

export function invitationPhase(input: { eventDate: string; deadline: string; status: string; today: string }): InvitationPhase {
  if (input.status === "cancelled") return "cancelled";
  if (input.today > input.eventDate.slice(0, 10)) return "after";
  if (input.today > input.deadline) return "closed";
  return "open";
}

/** "2027-06-12" → "12.06.2027". */
export function formatDeadline(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Whether a guest who said yes answered before the date moved, and so is
 * asked to confirm again. `answeredAt` is their last answer (or, for a guest
 * the couple marked themselves, when the guest was added).
 */
export function needsReconfirm(status: string, answeredAt: string | null, postponedAt: string | null): boolean {
  if (status !== "confirmed" || !postponedAt) return false;
  return !answeredAt || new Date(answeredAt).getTime() < new Date(postponedAt).getTime();
}

/** The couple's line about the deadline (home card and guest list); null once the event is past. */
export function coupleDeadlineText(input: { deadline: string; eventDate: string; status: string; today: string }): string | null {
  const phase = invitationPhase(input);
  if (phase === "after" || phase === "cancelled") return null;
  if (phase === "open") return `Гостите можат да одговорат до ${formatDeadline(input.deadline)}.`;
  return `Рокот за одговор на гостите помина (${formatDeadline(input.deadline)}). Одговорите што ќе ги добиете сега внесете ги сами.`;
}

/**
 * 0184: whether an event's own deadline goes back to the venue's default
 * when the event moves: only when it moves later, the deadline was left as
 * it was, and it now falls before the new date's default (it would close the
 * form early for no reason). A deadline typed in the same save is kept.
 */
export function rsvpDeadlineResets(input: {
  oldDate: string;
  newDate: string;
  oldDeadline: string | null;
  /** What the save sends; undefined keeps the stored one. */
  newDeadline: string | null | undefined;
  defaultDays: number;
}): boolean {
  const { oldDate, newDate, oldDeadline, newDeadline, defaultDays } = input;
  if (!oldDeadline || !newDate || newDate <= oldDate) return false;
  if (newDeadline !== undefined && newDeadline !== oldDeadline) return false;
  return oldDeadline < effectiveRsvpDeadline(newDate, null, defaultDays);
}
