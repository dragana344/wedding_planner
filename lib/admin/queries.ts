import "server-only";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { todayIn, VENUE_TIME_ZONE } from "@/lib/date";
import { startOfDaySkopjeIso, endOfDaySkopjeIso } from "@/lib/admin/audit-filters";
import { isSupportStatus, type SupportStatus } from "@/lib/support/status";
import { signedAttachmentUrls } from "@/lib/admin/task-attachments";

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
  /** 0172: when the admin-scheduled deletion runs; null when none is scheduled. */
  deletionScheduledFor: string | null;
  staff: { userId: string; email: string; lastSignInAt: string | null }[];
  managers: { id: string; name: string; isOwner: boolean }[];
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
  /** 0170: end date set by a cancellation / by the admin; see lib/couple/access.ts. */
  accessUntil: string | null;
  accessExtendedUntil: string | null;
  personalDataErasedAt: string | null;
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
/** kind: 'demo' for /signup's "request a demo" form (0173), 'contact' for the landing page's contact form. */
export type MessageRow = {
  id: string;
  kind: "contact" | "demo";
  name: string;
  email: string;
  message: string;
  status: SupportStatus;
  createdAt: string;
  handledAt: string | null;
};
/** One row of the "Пораки и барања" inbox: a public contact message or a venue/couple support ticket. */
export type InboxRow = {
  kind: "contact" | "ticket";
  id: string;
  source: InboxSource;
  from: string;
  venueName: string | null;
  coupleNames: string | null;
  subject: string;
  status: SupportStatus;
  /** The sender spoke last and no admin has answered yet. */
  awaitingAdmin: boolean;
  lastActivityAt: string;
};
export type InboxSource = "public" | "venue" | "couple";
export type InboxTicket = {
  id: string;
  venueId: string;
  venueName: string;
  eventId: string | null;
  coupleNames: string | null;
  submittedBy: "venue" | "couple";
  name: string;
  problem: string;
  description: string;
  status: SupportStatus;
  awaitingAdmin: boolean;
  createdAt: string;
  resolvedAt: string | null;
};
export type InboxTicketMessage = { id: string; author: "requester" | "admin"; adminEmail: string | null; body: string; createdAt: string };
export type AdminAccount = { id: string; email: string };
export type AdminTaskView = "mine" | "sent" | "all";
export type AdminTaskRow = {
  id: string;
  title: string;
  description: string;
  status: SupportStatus;
  createdBy: string | null;
  createdByEmail: string | null;
  /** null = sent to every admin; whoever starts it takes it. */
  assignedTo: string | null;
  assignedToEmail: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** True when the other side commented since this side last opened the task. */
  createdByUnread: boolean;
  assignedToUnread: boolean;
  /** Photos/PDFs attached when the task was created (0153); signed, valid an hour. Empty in the list view — only getAdminTask resolves these. */
  attachments: AdminTaskAttachment[];
};
export type AdminTaskAttachment = { path: string; url: string };
export type AdminTaskComment = {
  id: string;
  authorId: string | null;
  authorEmail: string | null;
  body: string;
  createdAt: string;
  attachments: AdminTaskAttachment[];
};
export type AdminBadgeCounts = { inbox: number; tasks: number };
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
const DEFAULT_SIGNUP_WEEKS = 4;
// A crafted or fat-fingered range (e.g. 10 years) would otherwise build a
// bucket array that long; 2 years of weekly buckets is already far more
// than this popup is for, and keeps the loop and the response bounded.
const MAX_RANGE_WEEKS = 104;

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
  const weeks = Array.from({ length: DEFAULT_SIGNUP_WEEKS }, (_, i) => {
    // i=last (the most recent bucket) must be [now-7d, now), not
    // [now, now+7d) — a venue can never have a future created_at, so the
    // old `(7 - i)` formula always left the last bucket at 0 and shifted
    // every label a week stale.
    const start = new Date(Date.now() - (DEFAULT_SIGNUP_WEEKS - i) * 7 * DAY);
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

/**
 * Weekly venue-signup counts across a specific date range — backs the
 * "Регистрации по недела" popup on the overview page, separately from
 * getOverviewStats's own fixed last-DEFAULT_SIGNUP_WEEKS view. Buckets run
 * from the range's Skopje-local start of day, 7 days at a time, with the
 * final bucket clipped to the range's Skopje-local end of day (so a range
 * that isn't an exact multiple of 7 days doesn't spill a stray extra day
 * into the next page's worth of buckets).
 */
export async function getSignupsByWeek(range: { from: string; to: string }): Promise<{ week: string; count: number }[]> {
  await requireAdmin();
  const { data: venues, error } = await db().from("venues").select("created_at").limit(10000);
  if (error) throw error;
  const start = new Date(startOfDaySkopjeIso(range.from));
  const end = new Date(endOfDaySkopjeIso(range.to));
  const weekCount = Math.min(MAX_RANGE_WEEKS, Math.max(1, Math.ceil((end.getTime() - start.getTime() + 1) / (7 * DAY))));
  return Array.from({ length: weekCount }, (_, i) => {
    const bucketStart = new Date(start.getTime() + i * 7 * DAY);
    const bucketEnd = new Date(Math.min(bucketStart.getTime() + 7 * DAY, end.getTime() + 1));
    return {
      week: bucketStart.toISOString().slice(0, 10),
      count: (venues ?? []).filter((v) => {
        const t = new Date(v.created_at).getTime();
        return t >= bucketStart.getTime() && t < bucketEnd.getTime();
      }).length,
    };
  });
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
  deletion_scheduled_for: string | null;
  plans: { name: string };
  venue_staff: { user_id: string }[];
  venue_managers: { id: string; name: string; is_owner: boolean }[];
  rooms: { id: string; name: string }[];
  events: { id: string; event_date: string; couple_names: string; status: string; event_type: string | null }[];
};

export async function getVenueDetail(id: string): Promise<VenueDetail | null> {
  await requireAdmin();
  if (!isUuid(id)) return null;
  const { data, error } = await db()
    .from("venues")
    .select(
      "id, name, plan_id, created_at, blocked_at, blocked_reason, deletion_scheduled_for, plans(name), venue_staff(user_id), venue_managers(id, name, is_owner), rooms(id, name), events(id, event_date, couple_names, status, event_type)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const v = data as unknown as VenueDetailDb;
  const users = await authUsersById(v.venue_staff.map((s) => s.user_id));
  const staff = v.venue_staff.map((s) => ({
    userId: s.user_id,
    email: users.get(s.user_id)?.email ?? "",
    lastSignInAt: users.get(s.user_id)?.last_sign_in_at ?? null,
  }));
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
    deletionScheduledFor: v.deletion_scheduled_for,
    lastSignInAt:
      staff
        .map((s) => s.lastSignInAt)
        .filter((v): v is string => v !== null)
        .sort()
        .at(-1) ?? null,
    staff,
    // Owner first, then by name — a stable order between loads.
    managers: v.venue_managers
      .map((m) => ({ id: m.id, name: m.name, isOwner: m.is_owner }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name, "mk")),
    rooms: v.rooms,
    events: v.events
      .map((e) => ({ id: e.id, date: e.event_date, coupleNames: e.couple_names, status: e.status, type: e.event_type }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

const EVENT_COLUMNS =
  "id, venue_id, event_date, start_time, end_time, couple_names, status, event_type, guest_count_estimate, couple_access_until, couple_access_extended_until, personal_data_erased_at, venues(name)";
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
  couple_access_until: string | null;
  couple_access_extended_until: string | null;
  personal_data_erased_at: string | null;
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
  accessUntil: e.couple_access_until,
  accessExtendedUntil: e.couple_access_extended_until,
  personalDataErasedAt: e.personal_data_erased_at,
});

export async function listEvents(filter: { venueId?: string; from?: string; to?: string; status?: string }): Promise<EventRow[]> {
  await requireAdmin();
  // Newest date first: with the row cap, the oldest history is what falls
  // off the end, not next month's events.
  let query = db().from("events").select(EVENT_COLUMNS).order("event_date", { ascending: false }).limit(1000);
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
// couple's (spec §5 item 5) — unlike every other query in this module, the
// inbox may read their name/email/message. See the allow-list comment in
// tests/security/admin-static.test.ts. Support tickets (0089, 0150) are
// filed by venue staff and couples against the team, not each other —
// venue_name and (when a couple filed it) couple_names are shown the same
// way the admin Events list already shows couple_names.
type MessageDb = {
  id: string;
  kind: "contact" | "demo";
  name: string;
  email: string;
  message: string;
  status: SupportStatus;
  created_at: string;
  handled_at: string | null;
};
const MESSAGE_COLUMNS = "id, kind, name, email, message, status, created_at, handled_at";
const toMessage = (m: MessageDb): MessageRow => ({
  id: m.id,
  kind: m.kind,
  name: m.name,
  email: m.email,
  message: m.message,
  status: m.status,
  createdAt: m.created_at,
  handledAt: m.handled_at,
});

type InboxTicketDb = {
  id: string;
  venue_id: string;
  event_id: string | null;
  submitted_by: "venue" | "couple";
  name: string;
  problem: string;
  description: string;
  status: SupportStatus;
  awaiting_admin: boolean;
  last_message_at: string;
  created_at: string;
  resolved_at: string | null;
  venues: { name: string } | { name: string }[] | null;
  events: { couple_names: string } | { couple_names: string }[] | null;
};
const INBOX_TICKET_COLUMNS =
  "id, venue_id, event_id, submitted_by, name, problem, description, status, awaiting_admin, last_message_at, created_at, resolved_at, venues(name), events(couple_names)";
const INBOX_LIMIT = 500;
const INBOX_SOURCES = new Set(["public", "venue", "couple"]);
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function toInboxTicket(t: InboxTicketDb): InboxTicket {
  return {
    id: t.id,
    venueId: t.venue_id,
    venueName: one(t.venues)?.name ?? "—",
    eventId: t.event_id,
    coupleNames: one(t.events)?.couple_names ?? null,
    submittedBy: t.submitted_by,
    name: t.name,
    problem: t.problem,
    description: t.description,
    status: t.status,
    awaitingAdmin: t.awaiting_admin,
    createdAt: t.created_at,
    resolvedAt: t.resolved_at,
  };
}

/** A demo request's message is "Локал: …" lines (lib/venue/contact.ts), shown on one line. */
function contactSubject(m: MessageDb): string {
  const text = m.kind === "demo" ? `Барање за демо · ${m.message.split("\n").filter(Boolean).join(" · ")}` : m.message;
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

/**
 * The "Пораки и барања" inbox: public contact messages and venue/couple
 * tickets in one list, newest activity first. An unrecognised status or
 * source (a stale bookmark, a hand-edited URL) falls back to "all" rather
 * than a query that matches nothing.
 */
export async function listInbox(filter: { status?: string; source?: string }): Promise<InboxRow[]> {
  await requireAdmin();
  const status = isSupportStatus(filter.status) ? filter.status : undefined;
  const source = filter.source && INBOX_SOURCES.has(filter.source) ? (filter.source as InboxSource) : undefined;

  const contactsQuery = async (): Promise<InboxRow[]> => {
    if (source && source !== "public") return [];
    let q = db().from("contact_submissions").select(MESSAGE_COLUMNS).order("created_at", { ascending: false }).limit(INBOX_LIMIT);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as MessageDb[]).map((m) => ({
      kind: "contact",
      id: m.id,
      source: "public",
      from: m.name,
      venueName: null,
      coupleNames: null,
      subject: contactSubject(m),
      status: m.status,
      awaitingAdmin: m.status === "new",
      lastActivityAt: m.created_at,
    }));
  };
  const ticketsQuery = async (): Promise<InboxRow[]> => {
    if (source === "public") return [];
    let q = db().from("support_tickets").select(INBOX_TICKET_COLUMNS).order("last_message_at", { ascending: false }).limit(INBOX_LIMIT);
    if (status) q = q.eq("status", status);
    if (source) q = q.eq("submitted_by", source);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as unknown as InboxTicketDb[]).map((t) => ({
      kind: "ticket",
      id: t.id,
      source: t.submitted_by,
      from: t.name,
      venueName: one(t.venues)?.name ?? "—",
      coupleNames: one(t.events)?.couple_names ?? null,
      subject: t.problem,
      status: t.status,
      awaitingAdmin: t.awaiting_admin,
      lastActivityAt: t.last_message_at,
    }));
  };

  const [contacts, tickets] = await Promise.all([contactsQuery(), ticketsQuery()]);
  return [...contacts, ...tickets].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).slice(0, INBOX_LIMIT);
}

export async function getContactMessage(id: string): Promise<MessageRow | null> {
  await requireAdmin();
  if (!isUuid(id)) return null;
  const { data, error } = await db().from("contact_submissions").select(MESSAGE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toMessage(data as MessageDb) : null;
}

export async function getInboxTicket(id: string): Promise<{ ticket: InboxTicket; messages: InboxTicketMessage[] } | null> {
  await requireAdmin();
  if (!isUuid(id)) return null;
  const { data, error } = await db().from("support_tickets").select(INBOX_TICKET_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: messages, error: messagesError } = await db()
    .from("support_ticket_messages")
    .select("id, author, admin_user_id, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });
  if (messagesError) throw messagesError;
  const rows = (messages ?? []) as { id: string; author: "requester" | "admin"; admin_user_id: string | null; body: string; created_at: string }[];
  const emails = await adminEmails();
  return {
    ticket: toInboxTicket(data as unknown as InboxTicketDb),
    messages: rows.map((m) => ({
      id: m.id,
      author: m.author,
      adminEmail: m.admin_user_id ? (emails.get(m.admin_user_id) ?? null) : null,
      body: m.body,
      createdAt: m.created_at,
    })),
  };
}

// Admin accounts are Auth users with app_metadata.role = platform_admin
// (docs/production/ADMIN.md) — no table of their own, so this pages through
// auth.admin.listUsers the same way authUsersById does.
async function loadAdmins(): Promise<AdminAccount[]> {
  const admins: AdminAccount[] = [];
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.app_metadata?.role === "platform_admin") admins.push({ id: u.id, email: u.email ?? u.id });
    if (data.users.length < 1000) break;
  }
  return admins.sort((a, b) => a.email.localeCompare(b.email));
}

async function adminEmails(): Promise<Map<string, string>> {
  return new Map((await loadAdmins()).map((a) => [a.id, a.email]));
}

export async function listAdmins(): Promise<AdminAccount[]> {
  await requireAdmin();
  return loadAdmins();
}

type AdminTaskDb = {
  id: string;
  title: string;
  description: string;
  status: SupportStatus;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by_unread: boolean;
  assigned_to_unread: boolean;
  attachment_paths: string[];
};
const ADMIN_TASK_COLUMNS =
  "id, title, description, status, created_by, assigned_to, created_at, updated_at, completed_at, created_by_unread, assigned_to_unread, attachment_paths";

const toAdminTask = (t: AdminTaskDb, emails: Map<string, string>, urls: Map<string, string> = new Map()): AdminTaskRow => ({
  id: t.id,
  title: t.title,
  description: t.description,
  status: t.status,
  createdBy: t.created_by,
  createdByEmail: t.created_by ? (emails.get(t.created_by) ?? null) : null,
  assignedTo: t.assigned_to,
  assignedToEmail: t.assigned_to ? (emails.get(t.assigned_to) ?? null) : null,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
  completedAt: t.completed_at,
  createdByUnread: t.created_by_unread,
  assignedToUnread: t.assigned_to_unread,
  attachments: t.attachment_paths.map((path) => ({ path, url: urls.get(path) ?? "" })),
});

/**
 * "mine": sent to me, or to every admin by someone else (I can pick it up).
 * "sent": the tasks I created, so I can follow their status.
 */
export async function listAdminTasks(adminUserId: string, filter: { view?: string; status?: string }): Promise<AdminTaskRow[]> {
  await requireAdmin();
  let q = db().from("admin_tasks").select(ADMIN_TASK_COLUMNS).order("updated_at", { ascending: false }).limit(500);
  if (filter.view === "sent") q = q.eq("created_by", adminUserId);
  else if (filter.view !== "all") q = q.or(`assigned_to.eq.${adminUserId},and(assigned_to.is.null,created_by.neq.${adminUserId})`);
  if (isSupportStatus(filter.status)) q = q.eq("status", filter.status);
  const [{ data, error }, emails] = await Promise.all([q, adminEmails()]);
  if (error) throw error;
  return ((data ?? []) as AdminTaskDb[]).map((t) => toAdminTask(t, emails));
}

/** `viewerAdminUserId` clears that side's unread flag (sender opening a task
 * clears createdByUnread, the assignee opening it clears assignedToUnread) —
 * same "opening it marks it seen" rule as support tickets. Omit it for a
 * read that shouldn't mark anything seen. */
export async function getAdminTask(id: string, viewerAdminUserId?: string): Promise<{ task: AdminTaskRow; comments: AdminTaskComment[] } | null> {
  await requireAdmin();
  if (!isUuid(id)) return null;
  const [{ data, error }, { data: comments, error: commentsError }, emails] = await Promise.all([
    db().from("admin_tasks").select(ADMIN_TASK_COLUMNS).eq("id", id).maybeSingle(),
    db().from("admin_task_comments").select("id, author_id, body, created_at, attachment_paths").eq("task_id", id).order("created_at", { ascending: true }),
    adminEmails(),
  ]);
  if (error) throw error;
  if (commentsError) throw commentsError;
  if (!data) return null;
  const commentRows = (comments ?? []) as { id: string; author_id: string | null; body: string; created_at: string; attachment_paths: string[] }[];
  const urls = await signedAttachmentUrls([...(data as AdminTaskDb).attachment_paths, ...commentRows.flatMap((c) => c.attachment_paths)]);
  const task = toAdminTask(data as AdminTaskDb, emails, urls);
  if (viewerAdminUserId === task.createdBy && task.createdByUnread) {
    const { error: seenError } = await db().from("admin_tasks").update({ created_by_unread: false }).eq("id", id);
    if (seenError) throw seenError;
    task.createdByUnread = false;
  } else if (viewerAdminUserId === task.assignedTo && task.assignedToUnread) {
    const { error: seenError } = await db().from("admin_tasks").update({ assigned_to_unread: false }).eq("id", id);
    if (seenError) throw seenError;
    task.assignedToUnread = false;
  }
  return {
    task,
    comments: commentRows.map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorEmail: c.author_id ? (emails.get(c.author_id) ?? null) : null,
      body: c.body,
      attachments: c.attachment_paths.map((path) => ({ path, url: urls.get(path) ?? "" })),
      createdAt: c.created_at,
    })),
  };
}

/**
 * The sidebar's counts. inbox: new contact messages plus tickets whose
 * sender spoke last. tasks: tasks waiting for me to start them — sent to me,
 * or to every admin by someone else — plus tasks I'm already part of
 * (sender or assignee) where the other side commented since I last opened it.
 */
export async function getAdminBadgeCounts(adminUserId: string): Promise<AdminBadgeCounts> {
  await requireAdmin();
  const [contacts, tickets, tasks] = await Promise.all([
    db().from("contact_submissions").select("id", { count: "exact", head: true }).eq("status", "new"),
    db().from("support_tickets").select("id", { count: "exact", head: true }).eq("awaiting_admin", true),
    db()
      .from("admin_tasks")
      .select("id", { count: "exact", head: true })
      .or(
        `and(status.eq.new,assigned_to.eq.${adminUserId}),` +
          `and(status.eq.new,assigned_to.is.null,created_by.neq.${adminUserId}),` +
          `and(created_by.eq.${adminUserId},created_by_unread.eq.true),` +
          `and(assigned_to.eq.${adminUserId},assigned_to_unread.eq.true)`,
      ),
  ]);
  for (const r of [contacts, tickets, tasks]) if (r.error) throw r.error;
  return { inbox: (contacts.count ?? 0) + (tickets.count ?? 0), tasks: tasks.count ?? 0 };
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

export type PricingCardRow = {
  id: string;
  name: string;
  price: string;
  period: string | null;
  features: string[];
  isFeatured: boolean;
  isPublished: boolean;
  sortOrder: number;
};

/** Every landing-page price card, published or not, in display order (0085). */
export async function listPricingCards(): Promise<PricingCardRow[]> {
  await requireAdmin();
  const { data, error } = await db()
    .from("pricing_cards")
    .select("id, name, price, period, features, is_featured, is_published, sort_order")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    price: c.price as string,
    period: c.period as string | null,
    features: c.features as string[],
    isFeatured: c.is_featured as boolean,
    isPublished: c.is_published as boolean,
    sortOrder: c.sort_order as number,
  }));
}
