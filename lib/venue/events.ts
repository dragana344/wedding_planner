import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

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
  | "other";

export interface EventDetail {
  id: string;
  couple_names: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  status: EventStatus;
  event_type: EventType;
  guest_count_estimate: number | null;
  menu_template_id: string | null;
  /** Dishes the couple picked via the custom menu builder — populated only
   * when menu_template_id is null and the couple actually built a custom
   * selection (lib/couple/menu.ts's "custom" mode). Empty otherwise. */
  customMenuItems: { id: string; name: string; course: string; photo_path: string | null }[];
  room_ids: string[];
  hasShowcasePhotos: boolean;
  seatedCount: number;
  contact_email: string | null;
  contact_email_2: string | null;
  contact_phone: string | null;
  total_price: number | null;
  deposit_paid: number | null;
}

export async function listEventsWithDetails(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventDetail[]> {
  const { data, error } = await client
    .from("events")
    .select(
      "id, couple_names, event_date, start_time, end_time, status, event_type, guest_count_estimate, menu_template_id, contact_email, contact_email_2, contact_phone, total_price, deposit_paid, event_rooms(room_id), event_showcase_photos(id), event_layout_elements(element_type, table_types(seats)), event_custom_menu_items(menu_items(id, name, course, photo_path))"
    )
    .eq("venue_id", venueId)
    .order("event_date")
    .order("start_time", { nullsFirst: false })
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  checkListBound(data, "events (details)");

  return (data ?? []).map((event) => {
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
      menu_template_id: event.menu_template_id,
      customMenuItems: ((event.event_custom_menu_items ?? []) as unknown as {
        menu_items: { id: string; name: string; course: string; photo_path: string | null } | null;
      }[])
        .map((link) => link.menu_items)
        .filter((item): item is { id: string; name: string; course: string; photo_path: string | null } => item !== null),
      room_ids: ((event.event_rooms ?? []) as { room_id: string }[]).map((r) => r.room_id),
      hasShowcasePhotos: ((event.event_showcase_photos ?? []) as { id: string }[]).length > 0,
      seatedCount,
      contact_email: event.contact_email,
      contact_email_2: event.contact_email_2,
      contact_phone: event.contact_phone,
      total_price: event.total_price,
      deposit_paid: event.deposit_paid,
    };
  });
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
  menu_template_id: string | null;
}

export async function createEvent(input: CreateEventInput): Promise<{ id: string }> {
  const supabase = resolveSupabaseClient();

  if (input.menu_template_id) {
    const { data: template, error: templateError } = await supabase
      .from("menu_templates")
      .select("id")
      .eq("id", input.menu_template_id)
      .eq("venue_id", input.venue_id)
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template) {
      throw new Error("Menu template does not belong to this venue");
    }
  }

  if (input.room_ids.length > 0) {
    const { data: rooms, error: roomsCheckError } = await supabase
      .from("rooms")
      .select("id")
      .eq("venue_id", input.venue_id)
      .in("id", input.room_ids);
    if (roomsCheckError) throw roomsCheckError;
    if ((rooms ?? []).length !== input.room_ids.length) {
      throw new Error("One or more rooms do not belong to this venue");
    }
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      venue_id: input.venue_id,
      couple_names: input.couple_names,
      event_date: input.event_date,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      event_type: input.event_type ?? "other",
      status: input.status ?? "preparation",
      guest_count_estimate: input.guest_count_estimate ?? null,
      menu_template_id: input.menu_template_id,
    })
    .select("id")
    .single();
  if (eventError) throw eventError;

  const { error: roomsError } = await supabase
    .from("event_rooms")
    .insert(input.room_ids.map((room_id) => ({ event_id: event.id, room_id })));
  if (roomsError) throw roomsError;

  return event;
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
  menu_template_id: string | null;
}

export async function updateEvent(
  eventId: string,
  venueId: string,
  input: UpdateEventInput
): Promise<void> {
  const supabase = resolveSupabaseClient();

  if (input.menu_template_id) {
    const { data: template, error: templateError } = await supabase
      .from("menu_templates")
      .select("id")
      .eq("id", input.menu_template_id)
      .eq("venue_id", venueId)
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template) {
      throw new Error("Menu template does not belong to this venue");
    }
  }

  if (input.room_ids.length > 0) {
    const { data: rooms, error: roomsCheckError } = await supabase
      .from("rooms")
      .select("id")
      .eq("venue_id", venueId)
      .in("id", input.room_ids);
    if (roomsCheckError) throw roomsCheckError;
    if ((rooms ?? []).length !== input.room_ids.length) {
      throw new Error("One or more rooms do not belong to this venue");
    }
  }

  const { error: eventError } = await supabase
    .from("events")
    .update({
      couple_names: input.couple_names,
      event_date: input.event_date,
      start_time: input.start_time,
      end_time: input.end_time,
      status: input.status,
      event_type: input.event_type,
      guest_count_estimate: input.guest_count_estimate,
      menu_template_id: input.menu_template_id,
    })
    .eq("id", eventId);
  if (eventError) throw eventError;

  // Only the halls that actually changed: removing a hall frees its seats
  // (0077), so kept halls must not be deleted and re-added; that also keeps
  // their layout_initialized_at claim.
  const { data: current, error: currentError } = await supabase
    .from("event_rooms")
    .select("room_id")
    .eq("event_id", eventId);
  if (currentError) throw currentError;
  const had = new Set((current ?? []).map((r) => r.room_id as string));
  const removed = Array.from(had).filter((id) => !input.room_ids.includes(id));
  const added = input.room_ids.filter((id) => !had.has(id));

  if (removed.length > 0) {
    const { error: deleteRoomsError } = await supabase
      .from("event_rooms")
      .delete()
      .eq("event_id", eventId)
      .in("room_id", removed);
    if (deleteRoomsError) throw deleteRoomsError;
  }

  if (added.length > 0) {
    const { error: insertRoomsError } = await supabase
      .from("event_rooms")
      .insert(added.map((room_id) => ({ event_id: eventId, room_id })));
    if (insertRoomsError) throw insertRoomsError;
  }
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await resolveSupabaseClient().from("events").delete().eq("id", eventId);
  if (error) throw error;
}

export interface EventContactInfo {
  contact_email: string | null;
  contact_email_2: string | null;
  contact_phone: string | null;
}

export async function updateEventContactInfo(eventId: string, input: EventContactInfo): Promise<void> {
  const { error } = await resolveSupabaseClient().from("events").update(input).eq("id", eventId);
  if (error) throw error;
}

export interface EventFinanceInfo {
  total_price: number | null;
  deposit_paid: number | null;
}

export async function updateEventFinance(eventId: string, input: EventFinanceInfo): Promise<void> {
  const { error } = await resolveSupabaseClient().from("events").update(input).eq("id", eventId);
  if (error) throw error;
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
