import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";
import { parseCoupleContacts, type CoupleContactsInput } from "@/lib/venue/event-contacts";
import { credentialsError } from "@/lib/venue/credentials";
import { todayIn } from "@/lib/date";
import { toMenuSubmission, type MenuSubmission, type MenuSubmissionRow } from "@/lib/menu-numbers";

export interface EventSummary {
  id: string;
  couple_names: string;
  event_date: string;
  guest_count_estimate: number | null;
}

export async function listEvents(venueId: string): Promise<EventSummary[]> {
  const { data, error } = await resolveSupabaseClient()
    .from("events")
    .select("id, couple_names, event_date, guest_count_estimate")
    .eq("venue_id", venueId)
    .order("event_date")
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return checkListBound(data, "events");
}

/** Lifecycle of an event as tracked by venue staff. Mirrors the DB check constraint. */
export type EventStatus =
  | "preparation"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

/** Drives icon and colour coding across the calendar and event lists. */
export type EventType =
  | "wedding"
  | "birthday"
  | "baptism"
  | "graduation"
  | "corporate"
  | "anniversary"
  | "family"
  | "conference"
  | "presentation"
  | "seminar"
  | "team_building"
  | "new_year"
  | "school"
  | "baby_shower"
  | "other";

export interface EventMenuItem {
  id: string;
  name: string;
  course: string;
  photo_path: string | null;
}

export interface EventMenu {
  id: string;
  name: string;
  /** An event-only menu built by the manager (menu_templates.event_id set). */
  isCustom: boolean;
  items: EventMenuItem[];
}

export interface EventDetail {
  id: string;
  couple_names: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  status: EventStatus;
  event_type: EventType;
  guest_count_estimate: number | null;
  /** Every menu linked to the event (event_menu_templates), custom ones included. */
  menus: EventMenu[];
  room_ids: string[];
  hasShowcasePhotos: boolean;
  seatedCount: number;
  contact_email: string | null;
  contact_email_2: string | null;
  contact_phone: string | null;
  total_price: number | null;
  deposit_paid: number | null;
  /** The couple confirmed a seating change staff hasn't opened yet. */
  hasUnseenSeatingChange: boolean;
  /** What the couple sent the venue: the newest sending and the one before it. */
  menuNumbers: { latest: MenuSubmission | null; previous: MenuSubmission | null };
}

/**
 * The couple's contact details and the event's money — manager/owner only
 * (migration 0117 withholds these columns from plain staff sessions). Read
 * only server-side with the service-role client, behind an elevation check.
 */
export const EVENT_PRIVATE_COLUMNS = "contact_email, contact_email_2, contact_phone, total_price, deposit_paid";

export type EventPrivateDetails = Pick<EventDetail, "id" | "contact_email" | "contact_email_2" | "contact_phone" | "total_price" | "deposit_paid">;

/** Every event's private details for a venue (manager/owner routes only). */
export async function listEventPrivateDetails(venueId: string, client: SupabaseClient): Promise<EventPrivateDetails[]> {
  const { data, error } = await client
    .from("events")
    .select(`id, ${EVENT_PRIVATE_COLUMNS}`)
    .eq("venue_id", venueId)
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return checkListBound(data, "events (private)") as EventPrivateDetails[];
}

/** Clears the private fields — what a plain staff session is given. */
export function withoutPrivateDetails<T extends EventDetail>(event: T): T {
  return { ...event, contact_email: null, contact_email_2: null, contact_phone: null, total_price: null, deposit_paid: null };
}

const EVENT_DETAIL_COLUMNS =
  "id, couple_names, event_date, start_time, end_time, status, event_type, guest_count_estimate, seating_unseen_at, event_rooms(room_id), event_showcase_photos(id), event_layout_elements(element_type, table_types(seats)), event_menu_templates(menu_templates(id, name, event_id, menu_template_items(menu_items(id, name, course, photo_path)))), event_menu_submissions(id, sent_at, sent_by, counts, menu_titles, total, seen_at, seen_by)";

type EventDetailRow = {
  id: string;
  couple_names: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  event_type: string;
  guest_count_estimate: number | null;
  seating_unseen_at: string | null;
  event_rooms: { room_id: string }[] | null;
  event_showcase_photos: { id: string }[] | null;
  event_layout_elements: unknown;
  event_menu_templates: unknown;
  event_menu_submissions: MenuSubmissionRow[] | null;
  // Present only with includePrivate.
  contact_email?: string | null;
  contact_email_2?: string | null;
  contact_phone?: string | null;
  total_price?: number | null;
  deposit_paid?: number | null;
};

type MenuTemplateRow = {
  id: string;
  name: string;
  event_id: string | null;
  menu_template_items: { menu_items: EventMenuItem | EventMenuItem[] | null }[] | null;
};

function toEventMenus(raw: unknown): EventMenu[] {
  const links = (raw ?? []) as { menu_templates: MenuTemplateRow | MenuTemplateRow[] | null }[];
  return links
    .map((link) => (Array.isArray(link.menu_templates) ? link.menu_templates[0] : link.menu_templates))
    .filter((t): t is MenuTemplateRow => Boolean(t))
    .map((t) => ({
      id: t.id,
      name: t.name,
      isCustom: t.event_id !== null,
      items: (t.menu_template_items ?? [])
        .map((row) => (Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items))
        .filter((item): item is EventMenuItem => Boolean(item)),
    }))
    // The nested select has no order of its own; menus[0] must be stable.
    .sort((a, b) => a.name.localeCompare(b.name, "mk") || a.id.localeCompare(b.id));
}

function toMenuNumbers(rows: MenuSubmissionRow[] | null): EventDetail["menuNumbers"] {
  const [latest, previous] = [...(rows ?? [])]
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at) || b.id.localeCompare(a.id))
    .slice(0, 2)
    .map(toMenuSubmission);
  return { latest: latest ?? null, previous: previous ?? null };
}

/**
 * Every event of a venue with its rooms, photos and seats. Without
 * `includePrivate` (the default — every page a plain staff member can open)
 * the couple's contacts and the money stay null; only a manager-gated route
 * using the service-role client may pass it.
 */
export async function listEventsWithDetails(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient(),
  options: { includePrivate?: boolean } = {}
): Promise<EventDetail[]> {
  const { data, error } = await client
    .from("events")
    .select(options.includePrivate ? `${EVENT_DETAIL_COLUMNS}, ${EVENT_PRIVATE_COLUMNS}` : EVENT_DETAIL_COLUMNS)
    .eq("venue_id", venueId)
    .order("event_date")
    .order("start_time", { nullsFirst: false })
    .order("sent_at", { ascending: false, referencedTable: "event_menu_submissions" })
    .limit(2, { referencedTable: "event_menu_submissions" })
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  checkListBound(data, "events (details)");

  return ((data ?? []) as unknown as EventDetailRow[]).map((event) => {
    const layoutElements = (event.event_layout_elements ?? []) as unknown as {
      element_type: string;
      table_types: { seats: number } | { seats: number }[] | null;
    }[];
    const seatedCount = layoutElements
      .filter((el) => el.element_type === "table")
      .reduce((sum, el) => {
        const tableType = Array.isArray(el.table_types) ? el.table_types[0] : el.table_types;
        return sum + (tableType?.seats ?? 0);
      }, 0);

    return {
      id: event.id,
      couple_names: event.couple_names,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      status: event.status as EventStatus,
      event_type: event.event_type as EventType,
      guest_count_estimate: event.guest_count_estimate,
      menus: toEventMenus(event.event_menu_templates),
      room_ids: ((event.event_rooms ?? []) as { room_id: string }[]).map((r) => r.room_id),
      hasShowcasePhotos: ((event.event_showcase_photos ?? []) as { id: string }[]).length > 0,
      seatedCount,
      contact_email: event.contact_email ?? null,
      contact_email_2: event.contact_email_2 ?? null,
      contact_phone: event.contact_phone ?? null,
      total_price: event.total_price ?? null,
      deposit_paid: event.deposit_paid ?? null,
      hasUnseenSeatingChange: event.seating_unseen_at !== null,
      menuNumbers: toMenuNumbers(event.event_menu_submissions),
    };
  });
}

/** Clears the "new change" dot for this event — called when staff opens its seating page. */
export async function markSeatingSeen(
  eventId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const { error } = await client.from("events").update({ seating_unseen_at: null }).eq("id", eventId);
  if (error) throw error;
}

export interface EventBasic {
  id: string;
  venue_id: string;
  couple_names: string;
  event_date: string;
}

export async function getEventById(
  eventId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventBasic | null> {
  const { data, error } = await client
    .from("events")
    .select("id, venue_id, couple_names, event_date")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface CalendarEvent {
  id: string;
  couple_names: string;
  event_date: string;
  room_ids: string[];
}

export async function listEventsForCalendar(
  venueId: string,
  monthStart: string,
  monthEndExclusive: string
): Promise<CalendarEvent[]> {
  const { data, error } = await resolveSupabaseClient()
    .from("events")
    .select("id, couple_names, event_date, event_rooms(room_id)")
    .eq("venue_id", venueId)
    .gte("event_date", monthStart)
    .lt("event_date", monthEndExclusive)
    .order("event_date")
    .limit(MAX_LIST_ROWS);
  if (error) throw error;

  return (data ?? []).map((event) => ({
    id: event.id,
    couple_names: event.couple_names,
    event_date: event.event_date,
    room_ids: ((event.event_rooms ?? []) as { room_id: string }[]).map((r) => r.room_id),
  }));
}

/** The venue's own shared packages, plus the event's own custom menus — never
 * another venue's menu or another event's custom one. */
async function assertMenusAllowed(
  client: SupabaseClient,
  venueId: string,
  menuTemplateIds: string[],
  eventId: string | null
): Promise<void> {
  const unique = [...new Set(menuTemplateIds)];
  if (unique.length === 0) return;
  let query = client.from("menu_templates").select("id").eq("venue_id", venueId).in("id", unique);
  query = eventId ? query.or(`event_id.is.null,event_id.eq.${eventId}`) : query.is("event_id", null);
  const { data, error } = await query;
  if (error) throw error;
  if ((data ?? []).length !== unique.length) {
    throw new Error("Едно или повеќе менија не припаѓаат на овој локал.");
  }
}

export interface CreateEventInput {
  venue_id: string;
  couple_names: string;
  event_date: string;
  /** Optional at creation — staff often book a date before pinning the hours. */
  start_time?: string | null;
  end_time?: string | null;
  event_type?: EventType;
  status?: EventStatus;
  guest_count_estimate?: number | null;
  room_ids: string[];
  /** The menus linked to the event, in order; may be empty. */
  menu_template_ids: string[];
  /** A21: required, saved with the event. */
  contacts: CoupleContactsInput;
  /** Optional, set in the same insert as the rest of the event — folded in
   * here (rather than a follow-up updateEventFinance call) specifically so
   * creating a deliberately backdated event with its finance figures
   * already known doesn't trip the past-event write lock that call now has
   * (security review finding: past events are read-only, enforced
   * server-side — see assertEventNotPast/PastEventError below). An insert
   * has no "past" state to violate; only *editing* an existing event does. */
  total_price?: number | null;
  deposit_paid?: number | null;
  /** Security review fix: the couple's login is created here, server-side,
   * in the same call as the event row — create_event_credentials' direct
   * `authenticated` grant was revoked (0111) since it let any staff session
   * mint a couple login with a password of their own choosing. */
  credentials: { username: string; password: string };
}

export async function createEvent(input: CreateEventInput, client: SupabaseClient = resolveSupabaseClient()): Promise<{ id: string }> {
  const contacts = parseCoupleContacts(input.contacts);
  if (!contacts.ok) throw new Error(contacts.error);
  const supabase = client;

  if (input.room_ids.length > 0) {
    const { data: rooms, error: roomsCheckError } = await supabase
      .from("rooms")
      .select("id")
      .eq("venue_id", input.venue_id)
      .in("id", input.room_ids);
    if (roomsCheckError) throw roomsCheckError;
    if ((rooms ?? []).length !== input.room_ids.length) {
      throw new Error("Една или повеќе сали не припаѓаат на овој локал.");
    }
  }

  await assertMenusAllowed(supabase, input.venue_id, input.menu_template_ids, null);

  // create_event_full (0112) does the event row, its rooms and the couple's
  // login as one Postgres function — one implicit transaction, so a failure
  // partway (e.g. the credentials insert) rolls back everything else the
  // function did instead of needing JS-level compensating cleanup that
  // could itself fail independently (final review finding).
  const { data: eventId, error } = await supabase.rpc("create_event_full", {
    p_venue_id: input.venue_id,
    p_couple_names: input.couple_names,
    p_event_date: input.event_date,
    p_start_time: input.start_time ?? null,
    p_end_time: input.end_time ?? null,
    p_event_type: input.event_type ?? "other",
    p_status: input.status ?? "preparation",
    p_guest_count_estimate: input.guest_count_estimate ?? null,
    p_room_ids: input.room_ids,
    p_contact_email: contacts.data.contact_email,
    p_contact_email_2: contacts.data.contact_email_2,
    p_contact_phone: contacts.data.contact_phone,
    p_total_price: input.total_price ?? null,
    p_deposit_paid: input.deposit_paid ?? null,
    p_username: input.credentials.username,
    p_password: input.credentials.password,
    p_menu_template_ids: input.menu_template_ids,
  });
  // The couple's login is created inside create_event_full (0112): a taken
  // username must still say so, not "the event could not be saved".
  if (error) throw credentialsError(error);
  return { id: eventId as string };
}

export interface UpdateEventInput {
  couple_names: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  status: EventStatus;
  event_type: EventType;
  guest_count_estimate: number | null;
  room_ids: string[];
  /** The menus the editing window linked / unlinked, relative to what it saw —
   * never the full list, so a menu added elsewhere meanwhile survives the save. */
  added_menu_ids: string[];
  removed_menu_ids: string[];
}

/** Thrown by the gated-route write helpers below when the eventId/venueId
 * pair matched zero rows — a deleted event, or one from another venue — so
 * callers can report 404 instead of a false {ok:true}. */
export class EventNotFoundError extends Error {
  constructor() {
    super("Настанот не е пронајден.");
  }
}

/** Past events are read-only server-side, not just in one UI path (security
 * review finding — this used to be enforced only by a `readOnly` prop
 * threaded through ClientsClient → EventEditForm; Настани and the full-page
 * seating editor had no lock at all, and no write endpoint checked the
 * event's own date). "Past" compares against the venue's local today
 * (lib/date.ts), the same definition the UI already uses. Deleting the
 * whole event and erasing its personal data are deliberately NOT gated by
 * this — both are documented as staff choices that stay available either
 * way, unlike editing the event's content. */
export class PastEventError extends Error {
  constructor() {
    super("Настанот е во минатото и повеќе не може да се уредува.");
  }
}

export async function assertEventNotPast(
  eventId: string,
  venueId: string,
  client: SupabaseClient
): Promise<void> {
  const { data, error } = await client.from("events").select("event_date").eq("id", eventId).eq("venue_id", venueId).maybeSingle();
  if (error) throw error;
  if (!data) throw new EventNotFoundError();
  if (data.event_date < todayIn()) throw new PastEventError();
}

export async function updateEvent(
  eventId: string,
  venueId: string,
  input: UpdateEventInput,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const supabase = client;
  await assertEventNotPast(eventId, venueId, supabase);

  if (input.room_ids.length > 0) {
    const { data: rooms, error: roomsCheckError } = await supabase
      .from("rooms")
      .select("id")
      .eq("venue_id", venueId)
      .in("id", input.room_ids);
    if (roomsCheckError) throw roomsCheckError;
    if ((rooms ?? []).length !== input.room_ids.length) {
      throw new Error("Една или повеќе сали не припаѓаат на овој локал.");
    }
  }

  const added = [...new Set(input.added_menu_ids)];
  const removed = [...new Set(input.removed_menu_ids)];
  await assertMenusAllowed(supabase, venueId, added, eventId);

  // update_event_full (0112; menu diff moved into it by 0124) does the event
  // row, its room diff and its menu-link diff as one Postgres function — one
  // implicit transaction, so a failure partway (e.g. the rooms insert) rolls
  // back the event row change too, instead of leaving an event saved with
  // half-updated rooms (final review finding). Passing only this window's
  // added/removed ids (never a recomputed full list) means a menu linked or
  // unlinked elsewhere in between always survives the save (0124 — the
  // previous read-then-recompute-then-overwrite approach did not).
  const { data: found, error } = await supabase.rpc("update_event_full", {
    p_event_id: eventId,
    p_venue_id: venueId,
    p_couple_names: input.couple_names,
    p_event_date: input.event_date,
    p_start_time: input.start_time,
    p_end_time: input.end_time,
    p_event_type: input.event_type,
    p_status: input.status,
    p_guest_count_estimate: input.guest_count_estimate,
    p_room_ids: input.room_ids,
    p_added_menu_ids: added,
    p_removed_menu_ids: removed,
  });
  if (error) throw error;
  if (!found) throw new EventNotFoundError();
}

// The routes call these with the service-role client, which bypasses RLS —
// so venueId is required: it is what scopes the write to the caller's venue.
export async function deleteEvent(eventId: string, venueId: string, client: SupabaseClient = resolveSupabaseClient()): Promise<void> {
  const { data, error } = await client.from("events").delete().eq("id", eventId).eq("venue_id", venueId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new EventNotFoundError();
}

export interface EventContactInfo {
  contact_email: string | null;
  contact_email_2: string | null;
  contact_phone: string | null;
}

/** A21: the couple's email and phone stay required when the venue edits them. */
export async function updateEventContactInfo(
  eventId: string,
  venueId: string,
  input: EventContactInfo,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  await assertEventNotPast(eventId, venueId, client);
  const contacts = parseCoupleContacts(input);
  if (!contacts.ok) throw new Error(contacts.error);
  const { data, error } = await client.from("events").update(contacts.data).eq("id", eventId).eq("venue_id", venueId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new EventNotFoundError();
}

export interface EventFinanceInfo {
  total_price: number | null;
  deposit_paid: number | null;
}

export async function updateEventFinance(
  eventId: string,
  venueId: string,
  input: EventFinanceInfo,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  // Deliberately not reachable during event creation — see CreateEventInput's
  // total_price/deposit_paid, which go straight into the insert instead so a
  // deliberately backdated event's finance fields aren't blocked by this.
  await assertEventNotPast(eventId, venueId, client);
  const { data, error } = await client.from("events").update(input).eq("id", eventId).eq("venue_id", venueId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new EventNotFoundError();
}

/**
 * Confirms the caller is venue staff for the venue that owns `eventId`.
 *
 * The caller's identity is established via the request-scoped `supabase` client's
 * `auth.getUser()` (session/cookie-bound, so it cannot be spoofed). Per Task 5's RLS
 * policies, `venue_staff` grants no access at all to anon/authenticated roles
 * (staff-to-venue assignment is only ever manageable via service_role), so the
 * `venue_staff` lookup must go through `adminClient` — but it is always filtered by
 * the caller's own verified user id, so this can never read another user's staff
 * row. `events` is likewise looked up via `adminClient` since the caller isn't
 * necessarily authorized to read the event yet.
 */
export async function isVenueStaffForEvent(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  eventId: string
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: staff } = await adminClient
    .from("venue_staff")
    .select("venue_id")
    .eq("user_id", user.id)
    .single();
  if (!staff) return false;

  const { data: event } = await adminClient
    .from("events")
    .select("venue_id")
    .eq("id", eventId)
    .single();
  if (!event) return false;

  return event.venue_id === staff.venue_id;
}

export const DEPOSIT_OVER_TOTAL_ERROR = "Капарот не може да биде поголем од вкупната цена.";

/** The form's check before saving finance: a deposit above the agreed price is a typing mistake. */
export function depositExceedsTotal(totalPrice: string, depositPaid: string): boolean {
  return totalPrice !== "" && depositPaid !== "" && Number(depositPaid) > Number(totalPrice);
}

export interface SameDayEvent {
  id: string;
  couple_names: string;
  start_time: string | null;
  end_time: string | null;
}

/**
 * Other events (not cancelled) on `date` that use any of `roomIds`, so the
 * form can warn before a hall is booked twice for the same day. Advisory
 * only: two events may share a hall on purpose (lunch and dinner).
 */
export async function findSameDayRoomEvents(
  venueId: string,
  date: string,
  roomIds: string[],
  excludeEventId: string | null = null,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<SameDayEvent[]> {
  if (!date || roomIds.length === 0) return [];
  const { data, error } = await client
    .from("events")
    .select("id, couple_names, start_time, end_time, status, event_rooms(room_id)")
    .eq("venue_id", venueId)
    .eq("event_date", date)
    .neq("status", "cancelled");
  if (error) throw error;
  return (data ?? [])
    .filter((e) => e.id !== excludeEventId)
    .filter((e) => ((e.event_rooms ?? []) as { room_id: string }[]).some((r) => roomIds.includes(r.room_id)))
    .map((e) => ({ id: e.id, couple_names: e.couple_names, start_time: e.start_time, end_time: e.end_time }));
}
