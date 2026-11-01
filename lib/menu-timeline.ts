// When the couple's final menu numbers are due (pure). Days are calendar
// days between "YYYY-MM-DD" strings; the counting is done in UTC so no
// time zone or daylight-saving shift can move a day.

export type TimelineStage = "none" | "couple_reminder" | "venue_can_remind" | "auto_send" | "too_late_for_auto";

const DAY_MS = 86_400_000;

function utcDay(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole calendar days from `today` to `eventDate` (negative once it is past). */
export function daysUntil(eventDate: string, today: string): number {
  return Math.round((utcDay(eventDate) - utcDay(today)) / DAY_MS);
}

/**
 * Where an event stands on the final-numbers timeline. 25..21 days out the
 * couple is reminded, 20..16 the venue may remind them too, and from 15 days
 * the numbers go automatically — unless the event was created within those
 * 15 days, when there was no time for the couple to send them.
 */
export function timelineStage(input: { eventDate: string; createdDate: string; today: string; sent: boolean }): TimelineStage {
  if (input.sent) return "none";
  const days = daysUntil(input.eventDate, input.today);
  if (days < 0 || days > 25) return "none";
  if (days >= 21) return "couple_reminder";
  if (days >= 16) return "venue_can_remind";
  return daysUntil(input.eventDate, input.createdDate) > 15 ? "auto_send" : "too_late_for_auto";
}

/**
 * Late events: the couple's 25-day reminder is skipped when the event was
 * created after that day had already passed. The venue's steps are unchanged.
 */
export function coupleReminderApplies(eventDate: string, createdDate: string): boolean {
  return daysUntil(eventDate, createdDate) >= 25;
}

/** Whether the couple's "send the final numbers" banner shows now (25..16 days out, nothing sent). */
export function coupleReminderDue(input: { eventDate: string; createdDate: string; today: string; sent: boolean }): boolean {
  const stage = timelineStage(input);
  return (stage === "couple_reminder" || stage === "venue_can_remind") && coupleReminderApplies(input.eventDate, input.createdDate);
}
