// Pure filter parsing for the date-range popup on /venue/notifications —
// same validate-or-drop convention as lib/admin/overview-filters.ts, reused
// directly rather than duplicated (it's pure date validation, nothing
// admin-specific).
import { isValidCalendarDate } from "@/lib/admin/audit-filters";
import { todayIn } from "@/lib/date";

export type NotificationsSearchParams = Partial<Record<"notifFrom" | "notifTo", string>>;

export type DateRange = { from: string; to: string };

// A malformed "from", or an inverted range, falls back to "no range" (the
// default last-50 view) instead of erroring. A missing/blank "to" is not an
// error — it defaults to today, so picking just a start date searches
// everything up to now.
export function parseNotificationsFilters(searchParams: NotificationsSearchParams): DateRange | undefined {
  const from = searchParams.notifFrom?.trim();
  const to = searchParams.notifTo?.trim() || todayIn();
  if (!from || !isValidCalendarDate(from) || !isValidCalendarDate(to) || from > to) return undefined;
  return { from, to };
}
