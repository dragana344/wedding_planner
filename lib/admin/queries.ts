import "server-only";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { todayIn, VENUE_TIME_ZONE } from "@/lib/date";

// Read models for the platform-admin dashboard (spec §3-4). Every query goes
// through the service-role client: staff never see this data (RLS has no
// policies for it), only the admin panel's server components/actions do,
// gated by requireAdmin. D2: admin code must never read guest/couple
// planning tables or the reservations table at all (tests/security/admin-
// static.test.ts enforces this by scanning app/admin, lib/admin,
// components/admin) — every select below sticks to venues, rooms, events'
// non-private columns, plans/entitlements tables, audit_log, platform_settings,
// auth.admin.* for staff identity, and contact_submissions (the platform's
// own data, not a venue's or a couple's — spec §5 item 5 — so its
// name/email/message are allowed here; see listMessages below and the
// allow-list comment in tests/security/admin-static.test.ts).

export type OverviewStats = {
  venues: number;
  activeVenues: number;
  blockedVenues: number;
  signupsByWeek: { week: string; count: number }[];
  upcomingEvents: number;
  newMessages: number;
};
export type VenueRow = {
  id: string;
  name: string;
  planId: string;
  planName: string;
  createdAt: string;
  staffCount: number;
  eventCount: number;
  lastSignInAt: string | null;
  blockedAt: string | null;
};
export type VenueDetail = VenueRow & {
  blockedReason: string | null;
  staff: { userId: string; email: string; mfa: boolean; lastSignInAt: string | null }[];
  rooms: { id: string; name: string }[];
  events: { id: string; date: string; coupleNames: string; status: string; type: string | null }[];
};
export type EventRow = {
  id: string;
  venueId: string;
  venueName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  coupleNames: string;
  status: string;
  type: string | null;
  guestEstimate: number | null;
};
export type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isDefault: boolean;
  isPublic: boolean;
  venueCount: number;
  features: Record<string, { enabled: boolean; limit: number | null }>;
};
export type OverrideRow = { featureKey: string; enabled: boolean | null; limitOverride: boolean; limitValue: number | null; note: string | null };
export type MessageRow = { id: string; name: string; email: string; message: string; status: string; createdAt: string; handledAt: string | null };
export type MaintenanceState = { maintenanceMode: boolean; updatedAt: string; updatedBy: string | null };
export type AuditRow = {
  id: number;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  action: string;
  venueId: string | null;
  eventId: string | null;
  targetId: string | null;
  requestId: string | null;
  details: Record<string, unknown>;
};

const db = () => createServiceRoleClient();
const DAY = 86_400_000;

// Postgres `date` columns (events.event_date) are calendar dates with no
// timezone of their own — comparing them against a UTC-computed "today" can
// be off by a day around midnight for staff in Europe/Skopje (UTC+1/+2).
// Reuses lib/date.ts's todayIn (already the shared Skopje-calendar-date
// helper, REL-006) instead of a second, ad hoc Intl.DateTimeFormat call.
const skopjeDateString = (date: Date): string => todayIn(VENUE_TIME_ZONE, date);

// Guards getVenueDetail/getEventDetail against a non-UUID id (e.g. a
// mistyped or crafted /admin/venues/<id> URL): Postgres raises a query error
// for `invalid input syntax for type uuid`, which would otherwise surface as
// a 500 instead of the page's normal notFound() 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string): boolean => UUID_RE.test(id);

type AuthUser = { id: string; email?: string; last_sign_in_at?: string | null };

// auth.admin has no "get users by id list" endpoint, so this pages through
// every user (1000 per page, GoTrue's max) until every id in `ids` has been
// found or the last page is reached. On a large shared instance this can be
// several requests; see task-3.1-report.md for the cost note. `page <= 200`
// is a hard stop (200k users) so a stale/deleted id can never spin this
// forever.
async function authUsersById(ids: string[]): Promise<Map<string, AuthUser>> {
  const wanted = new Set(ids);
  const found = new Map<string, AuthUser>();
  for (let page = 1; wanted.size > found.size && page <= 200; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (wanted.has(u.id)) found.set(u.id, u);
    if (data.users.length < 1000) break;
  }
  return found;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  await requireAdmin();
  const client = db();
  const today = skopjeDateString(new Date());
  const [{ data: venues }, { data: staff }, { count: upcoming }, { count: newMessages }] = await Promise.all([
    client.from("venues").select("id, created_at, blocked_at").limit(10000),
    client.from("venue_staff").select("user_id, venue_id").limit(10000),
    client
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("event_date", today)
      .lte("event_date", skopjeDateString(new Date(Date.now() + 30 * DAY))),
    client.from("contact_submissions").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const users = await authUsersById((staff ?? []).map((s) => s.user_id));
  const cutoff = Date.now() - 30 * DAY;
  const activeVenueIds = new Set(
    (staff ?? [])
      .filter((s) => {
        const at = users.get(s.user_id)?.last_sign_in_at;
        return at ? new Date(at).getTime() >= cutoff : false;
      })
      .map((s) => s.venue_id)
  );
  const weeks = Array.from({ length: 8 }, (_, i) => {
    // i=7 (the last/most recent bucket) must be [now-7d, now), not
    // [now, now+7d) — a venue can never have a future created_at, so the
    // old `(7 - i)` formula always left the last bucket at 0 and shifted
    // every label a week stale.
    const start = new Date(Date.now() - (8 - i) * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    return {
      week: start.toISOString().slice(0, 10),
      count: (venues ?? []).filter((v) => new Date(v.created_at) >= start && new Date(v.created_at) < end).length,
    };
  });
  return {
    venues: venues?.length ?? 0,
    activeVenues: activeVenueIds.size,
    blockedVenues: (venues ?? []).filter((v) => v.blocked_at).length,
    signupsByWeek: weeks,
    upcomingEvents: upcoming ?? 0,
    newMessages: newMessages ?? 0,
  };
}

type VenueListDb = {
  id: string;
  name: string;
  plan_id: string;
  created_at: string;
  blocked_at: string | null;
  plans: { name: string };
  venue_staff: { user_id: string }[];
  events: { id: string }[];
};

export async function listVenues(filter: { q?: string; planId?: string }): Promise<VenueRow[]> {
  await requireAdmin();
  let query = db()
    .from("venues")
    .select("id, name, plan_id, created_at, blocked_at, plans(name), venue_staff(user_id), events(id)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (filter.q) query = query.ilike("name", `%${filter.q.replace(/[%_*]/g, "")}%`);
  if (filter.planId) query = query.eq("plan_id", filter.planId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as VenueListDb[];
  const users = await authUsersById(rows.flatMap((r) => r.venue_staff.map((s) => s.user_id)));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    planId: r.plan_id,
    planName: r.plans.name,
    createdAt: r.created_at,
    staffCount: r.venue_staff.length,
    eventCount: r.events.length,
    blockedAt: r.blocked_at,
    lastSignInAt:
      r.venue_staff
        .map((s) => users.get(s.user_id)?.last_sign_in_at ?? null)
        .filter((v): v is string => v !== null)
        .sort()
        .at(-1) ?? null,
  }));
}

type VenueDetailDb = {
  id: string;
  name: string;
  plan_id: string;
  created_at: string;
  blocked_at: string | null;
  blocked_reason: string | null;
  plans: { name: string };
  venue_staff: { user_id: string }[];
  rooms: { id: string; name: string }[];
  events: { id: string; event_date: string; couple_names: string; status: string; event_type: string | null }[];
};

export async function getVenueDetail(id: string): Promise<VenueDetail | null> {
  await requireAdmin();
  if (!isUuid(id)) return null;
  const { data, error } = await db()
    .from("venues")
    .select(
      "id, name, plan_id, created_at, blocked_at, blocked_reason, plans(name), venue_staff(user_id), rooms(id, name), events(id, event_date, couple_names, status, event_type)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const v = data as unknown as VenueDetailDb;
  const users = await authUsersById(v.venue_staff.map((s) => s.user_id));
  const staff = await Promise.all(
    v.venue_staff.map(async (s) => {
      const { data: factors } = await db().auth.admin.mfa.listFactors({ userId: s.user_id });
      return {
        userId: s.user_id,
        email: users.get(s.user_id)?.email ?? "",
        mfa: (factors?.factors ?? []).some((f) => f.status === "verified"),
        lastSignInAt: users.get(s.user_id)?.last_sign_in_at ?? null,
      };
    })
  );
  return {
    id: v.id,
    name: v.name,
    planId: v.plan_id,
    planName: v.plans.name,
    createdAt: v.created_at,
    staffCount: staff.length,
    eventCount: v.events.length,
    blockedAt: v.blocked_at,
    blockedReason: v.blocked_reason,
    lastSignInAt:
      staff
        .map((s) => s.lastSignInAt)
        .filter((v): v is string => v !== null)
        .sort()
        .at(-1) ?? null,
    staff,
    rooms: v.rooms,
    events: v.events
      .map((e) => ({ id: e.id, date: e.event_date, coupleNames: e.couple_names, status: e.status, type: e.event_type }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

const EVENT_COLUMNS = "id, venue_id, event_date, start_time, end_time, couple_names, status, event_type, guest_count_estimate, venues(name)";
type EventDb = {
  id: string;
  venue_id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  couple_names: string;
  status: string;
  event_type: string | null;
  guest_count_estimate: number | null;
  venues: { name: string };
};
const toEvent = (e: EventDb): EventRow => ({
  id: e.id,
  venueId: e.venue_id,
  venueName: e.venues.name,
  date: e.event_date,
  startTime: e.start_time,
  endTime: e.end_time,
  coupleNames: e.couple_names,
  status: e.status,
  type: e.event_type,
  guestEstimate: e.guest_count_estimate,
});

export async function listEvents(filter: { venueId?: string; from?: string; to?: string; status?: string }): Promise<EventRow[]> {
  await requireAdmin();
  let query = db().from("events").select(EVENT_COLUMNS).order("event_date").limit(1000);
  if (filter.venueId) query = query.eq("venue_id", filter.venueId);
  if (filter.from) query = query.gte("event_date", filter.from);
  if (filter.to) query = query.lte("event_date", filter.to);
  if (filter.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as EventDb[]).map(toEvent);
}

export async function getEventDetail(id: string): Promise<EventRow | null> {
  await requireAdmin();
  if (!isUuid(id)) return null;
  const { data, error } = await db().from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toEvent(data as unknown as EventDb) : null;
}

type PlanListDb = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_default: boolean;
  is_public: boolean;
  plan_features: { feature_key: string; enabled: boolean; limit_value: number | null }[];
  venues: { id: string }[];
};

export async function listPlans(): Promise<PlanRow[]> {
  await requireAdmin();
  const { data, error } = await db()
    .from("plans")
    .select("id, name, description, sort_order, is_default, is_public, plan_features(feature_key, enabled, limit_value), venues(id)")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as PlanListDb[]).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    sortOrder: p.sort_order,
    isDefault: p.is_default,
    isPublic: p.is_public,
    venueCount: p.venues.length,
    features: Object.fromEntries(p.plan_features.map((f) => [f.feature_key, { enabled: f.enabled, limit: f.limit_value }])),
  }));
}

type OverrideDb = { feature_key: string; enabled: boolean | null; limit_override: boolean; limit_value: number | null; note: string | null };
const toOverride = (o: OverrideDb): OverrideRow => ({
  featureKey: o.feature_key,
  enabled: o.enabled,
  limitOverride: o.limit_override,
  limitValue: o.limit_value,
  note: o.note,
});

export async function getVenueOverrides(venueId: string): Promise<OverrideRow[]> {
  await requireAdmin();
  const { data, error } = await db().from("venue_feature_overrides").select("feature_key, enabled, limit_override, limit_value, note").eq("venue_id", venueId);
  if (error) throw error;
  return ((data ?? []) as OverrideDb[]).map(toOverride);
}

export async function getEventOverrides(eventId: string): Promise<OverrideRow[]> {
  await requireAdmin();
  const { data, error } = await db().from("event_feature_overrides").select("feature_key, enabled, limit_override, limit_value, note").eq("event_id", eventId);
  if (error) throw error;
  return ((data ?? []) as OverrideDb[]).map(toOverride);
}

// Contact submissions are the platform's own data, not a venue's or a
// couple's (spec §5 item 5) — unlike every other query in this module, this
// one is allowed to read name/email/message. See the allow-list comment in
// tests/security/admin-static.test.ts.
type MessageDb = { id: string; name: string; email: string; message: string; status: string; created_at: string; handled_at: string | null };
const MESSAGE_COLUMNS = "id, name, email, message, status, created_at, handled_at";
const toMessage = (m: MessageDb): MessageRow => ({
  id: m.id,
  name: m.name,
  email: m.email,
  message: m.message,
  status: m.status,
  createdAt: m.created_at,
  handledAt: m.handled_at,
});

const MESSAGE_STATUSES = new Set(["new", "read", "answered"]);

export async function listMessages(filter: { status?: string }): Promise<MessageRow[]> {
  await requireAdmin();
  let query = db().from("contact_submissions").select(MESSAGE_COLUMNS).order("created_at", { ascending: false }).limit(500);
  // An unrecognised status (a stale bookmark, a hand-edited URL) falls back
  // to "all" rather than a query that matches nothing.
  if (filter.status && MESSAGE_STATUSES.has(filter.status)) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as MessageDb[]).map(toMessage);
}

/**
 * System page (task 4.1, Minor 3): a direct, uncached read of the DB
 * maintenance flag — deliberately *not* lib/platform-settings.ts's
 * peek/refresh cache, which is tuned for proxy.ts's hot path (stale values,
 * fail-open) rather than an admin diagnostic page, where a stale or
 * silently-defaulted reading would be actively misleading. Throws on
 * failure like every other query here; the page itself renders an error
 * state instead of a fabricated "off".
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  await requireAdmin();
  const { data, error } = await db().from("platform_settings").select("maintenance_mode, updated_at, updated_by").eq("id", true).single();
  if (error) throw error;
  return { maintenanceMode: data.maintenance_mode === true, updatedAt: data.updated_at, updatedBy: data.updated_by };
}

const AUDIT_PAGE = 50;

type AuditDb = {
  id: number;
  occurred_at: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  venue_id: string | null;
  event_id: string | null;
  target_id: string | null;
  request_id: string | null;
  details: Record<string, unknown>;
};

export async function listAudit(filter: {
  venueId?: string;
  eventId?: string;
  action?: string;
  actorType?: string;
  from?: string;
  to?: string;
  page?: number;
}): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  await requireAdmin();
  const page = Math.max(0, filter.page ?? 0);
  let query = db()
    .from("audit_log")
    .select("*")
    .order("occurred_at", { ascending: false })
    .range(page * AUDIT_PAGE, page * AUDIT_PAGE + AUDIT_PAGE);
  if (filter.venueId) query = query.eq("venue_id", filter.venueId);
  if (filter.eventId) query = query.eq("event_id", filter.eventId);
  if (filter.action) query = query.eq("action", filter.action);
  if (filter.actorType) query = query.eq("actor_type", filter.actorType);
  if (filter.from) query = query.gte("occurred_at", filter.from);
  if (filter.to) query = query.lte("occurred_at", filter.to);
  const { data, error } = await query;
  if (error) throw error;
  const rows = ((data ?? []) as AuditDb[]).map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    actorType: r.actor_type,
    actorId: r.actor_id,
    action: r.action,
    venueId: r.venue_id,
    eventId: r.event_id,
    targetId: r.target_id,
    requestId: r.request_id,
    details: r.details,
  }));
  return { rows: rows.slice(0, AUDIT_PAGE), hasMore: rows.length > AUDIT_PAGE };
}
