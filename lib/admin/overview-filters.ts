// Pure filter parsing for the two date-range popups on the admin overview
// page (signups-by-week, recent admin actions) — same validate-or-drop
// convention as lib/admin/audit-filters.ts, and reuses its calendar-date
// check and Skopje day-boundary conversion rather than duplicating them.
import { isValidCalendarDate } from "@/lib/admin/audit-filters";
import { todayIn } from "@/lib/date";

export type OverviewSearchParams = Partial<Record<"signupsFrom" | "signupsTo" | "actionsFrom" | "actionsTo", string>>;

export type DateRange = { from: string; to: string };

export type OverviewFilters = {
  signups?: DateRange;
  actions?: DateRange;
};

// A malformed "from", or an inverted range (from after to, which would
// otherwise make every bucket/query come back empty instead of failing
// loud), falls back to "no range" — same as how parseAuditFilters drops
// rather than passes through invalid input. A missing/blank "to" is not an
// error, though: it defaults to today, so "from <date>" alone searches
// everything up to now without forcing the admin to also pick an end date.
function range(from: string | undefined, to: string | undefined): DateRange | undefined {
  const f = from?.trim();
  const t = to?.trim() || todayIn();
  if (!f || !isValidCalendarDate(f) || !isValidCalendarDate(t) || f > t) return undefined;
  return { from: f, to: t };
}

export function parseOverviewFilters(searchParams: OverviewSearchParams): OverviewFilters {
  return {
    signups: range(searchParams.signupsFrom, searchParams.signupsTo),
    actions: range(searchParams.actionsFrom, searchParams.actionsTo),
  };
}
