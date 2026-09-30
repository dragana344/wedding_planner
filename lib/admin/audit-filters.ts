// Pure filter parsing for the admin audit log page (task 4.2). No DB, no
// "server-only" — this is deliberately exercised directly from a unit test
// (tests/lib/pure/audit-filters.test.ts) with no Supabase mocking. It turns
// untrusted query-string values into a validated filter object: anything
// that fails validation is *dropped* rather than passed through, so a
// mistyped or crafted /admin/audit URL can never reach Postgres as e.g.
// `eq("venue_id", "not-a-uuid")` (which errors — `invalid input syntax for
// type uuid` — surfacing as a 500), `gte("occurred_at", "2028-02-30")`
// (`date/time field value out of range`, also a 500), or an absurdly large
// `page` turning into a huge `.range()` offset. It silently behaves like
// "no filter"/"page 0" instead.
//
// `from`/`to`'s Skopje day-boundary conversion lives in the separate
// `startOfDaySkopjeIso`/`endOfDaySkopjeIso` exports rather than inside
// AuditFilters.from/.to themselves: the page needs the *original*
// "YYYY-MM-DD" string twice — once for the <input type="date"> defaultValue,
// and once to round-trip through the "Следна"/"Претходна" pager links — and
// re-parsing an already-converted ISO instant (e.g.
// "2028-01-01T22:59:59.999Z") back through this same validator would fail
// the YYYY-MM-DD shape check and silently drop the filter on the next page.
// Keeping AuditFilters.from/.to as the plain validated date avoids that
// footgun; the page calls startOfDaySkopjeIso/endOfDaySkopjeIso only at the
// point it builds the listAudit() args.
import { VENUE_TIME_ZONE } from "@/lib/date";

export type AuditSearchParams = Partial<Record<"venue" | "event" | "action" | "actor" | "from" | "to" | "page", string>>;

export type AuditFilters = {
  venueId?: string;
  eventId?: string;
  action?: string;
  actorType?: string;
  from?: string;
  to?: string;
  page: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACTOR_TYPES = new Set(["admin", "staff", "couple", "guest", "system"]);
const ACTION_MAX_LENGTH = 100;
// A crafted `?page=999999999999999999999` would otherwise turn into a huge
// `.range()` offset (page * 50) passed straight to Postgrest/Postgres. Six
// digits (max 999999) comfortably covers any real audit_log page count
// while staying far below float-precision or query-cost concerns; longer
// falls back to page 0 rather than being clamped, matching how every other
// invalid value here is handled.
const PAGE_RE = /^\d{1,6}$/;

function str(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

// Rejects both malformed strings ("2028-2-3") and impossible calendar
// dates ("2028-02-30") — Date.UTC silently rolls the latter over into March,
// so the round-trip through getUTC*() catches it.
function isValidCalendarDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseAuditFilters(searchParams: AuditSearchParams): AuditFilters {
  const venue = str(searchParams.venue);
  const event = str(searchParams.event);
  const actor = str(searchParams.actor);
  const action = str(searchParams.action);
  const from = str(searchParams.from);
  const to = str(searchParams.to);
  const pageRaw = str(searchParams.page);
  return {
    venueId: venue && isUuid(venue) ? venue : undefined,
    eventId: event && isUuid(event) ? event : undefined,
    action: action && action.length <= ACTION_MAX_LENGTH ? action : undefined,
    actorType: actor && ACTOR_TYPES.has(actor) ? actor : undefined,
    from: from && isValidCalendarDate(from) ? from : undefined,
    to: to && isValidCalendarDate(to) ? to : undefined,
    page: pageRaw && PAGE_RE.test(pageRaw) ? Number(pageRaw) : 0,
  };
}

/**
 * Europe/Skopje's UTC offset (minutes) at the instant `probe` names. Used to
 * convert a Skopje wall-clock date+time into a UTC instant below: format
 * `probe` in the target zone, then compare the resulting wall-clock digits
 * back against `probe` itself (the standard formatToParts round-trip for
 * getting a zone's offset with no timezone library).
 */
function skopjeOffsetMinutesAt(probe: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(probe);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  // Some engines format local midnight as hour "24" rather than "00" with
  // hour12: false; normalize so Date.UTC below doesn't roll to the wrong day.
  const hour = map.hour === "24" ? "00" : map.hour;
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(hour), Number(map.minute), Number(map.second));
  return Math.round((asUtc - probe.getTime()) / 60_000);
}

/**
 * Converts a Skopje wall-clock date + time-of-day into a UTC ISO instant.
 * Probes the offset at a *naive* UTC guess (the date/time digits read as if
 * they were already UTC) rather than at a fixed hour: Europe's DST
 * transitions happen at 01:00-03:00 local, so start-of-day (00:00:00) and
 * end-of-day (23:59:59.999) of the same calendar date can actually sit on
 * opposite sides of a transition — a single fixed probe hour (e.g. noon)
 * would get one of the two wrong on transition day. The naive guess can
 * itself land within ~1-2h of a transition boundary in the rare case the
 * probed date *is* the transition day, which is the same known limitation
 * every offset-probing implementation without a full tz database has.
 */
function zonedWallClockToUtcIso(dateStr: string, hh: string, mm: string, ss: string, ms: string): string {
  const naiveUtcMs = Date.parse(`${dateStr}T${hh}:${mm}:${ss}.${ms}Z`);
  const offsetMin = skopjeOffsetMinutesAt(new Date(naiveUtcMs));
  return new Date(naiveUtcMs - offsetMin * 60_000).toISOString();
}

/**
 * Start-of-day (00:00:00.000) for a "YYYY-MM-DD" date as seen in
 * Europe/Skopje, returned as a UTC ISO instant — what listAudit's `from`
 * filter (a `gte` on the timestamptz occurred_at column) needs so a
 * Skopje-local day boundary isn't parsed by Postgres as UTC midnight
 * instead (which would clip the first 1-2 hours of the intended day).
 */
export function startOfDaySkopjeIso(dateStr: string): string {
  return zonedWallClockToUtcIso(dateStr, "00", "00", "00", "000");
}

/**
 * Inclusive end-of-day (23:59:59.999) for a "YYYY-MM-DD" date as seen in
 * Europe/Skopje, returned as a UTC ISO instant — what listAudit's `to`
 * filter (an `lte` on the timestamptz occurred_at column) needs to actually
 * cover the whole Skopje calendar day instead of being parsed by Postgres
 * as UTC midnight.
 */
export function endOfDaySkopjeIso(dateStr: string): string {
  return zonedWallClockToUtcIso(dateStr, "23", "59", "59", "999");
}
