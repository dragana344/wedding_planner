import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

export type RsvpStatus = "invited" | "confirmed" | "declined" | "pending" | "later";
export type GuestSide = "bride" | "groom";
export type MenuChoice = "standard" | "posno" | "vegetarian";
export type InvitationChannel = "whatsapp" | "viber" | "sms" | "email" | "link";

export interface Guest {
  id: string;
  event_id: string;
  full_name: string;
  phone: string | null;
  party_size: number;
  rsvp_status: RsvpStatus;
  notes: string | null;
  side: GuestSide | null;
  /** SEC-021: when the public invitation link last set this guest's answer. */
  rsvp_changed_via_link_at?: string | null;
  rsvp_previous_status?: RsvpStatus | null;
  /** Personal invite link token (`/invite/<slug>?g=<token>`, A1). */
  invite_token: string;
  email: string | null;
  children_count: number;
  menu_choice: MenuChoice | null;
  allergies: string | null;
  rsvp_comment: string | null;
  invitation_sent_at: string | null;
  invitation_channel: InvitationChannel | null;
}

export interface GuestInput {
  full_name: string;
  phone: string | null;
  party_size: number;
  notes: string | null;
  side: GuestSide | null;
  email?: string | null;
}

export interface GuestStats {
  total: number;
  confirmed: number;
  declined: number;
  pending: number;
  invited: number;
  /** "I'll answer later" (A2). */
  later: number;
  totalAttending: number;
  /** Of `totalAttending`. */
  childrenAttending: number;
  /** Portions for confirmed guests by menu (party size each), for the kitchen (A4). */
  menu: Record<MenuChoice | "unset", number>;
  invitationsSent: number;
}

/** Where a guest sits, from the seating plan (Session 3's `guest_seat()`). */
export interface GuestSeat {
  table_label: string | null;
  seat_number: number | null;
  room_name: string | null;
}

// One literal (not concatenated) so supabase-js can type the rows.
export const GUEST_COLUMNS =
  "id, event_id, full_name, phone, party_size, rsvp_status, notes, side, rsvp_changed_via_link_at, rsvp_previous_status, invite_token, email, children_count, menu_choice, allergies, rsvp_comment, invitation_sent_at, invitation_channel";

export async function listGuests(eventId: string): Promise<Guest[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .select(GUEST_COLUMNS)
    .eq("event_id", eventId)
    .order("created_at")
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return checkListBound(data, "event_guests");
}

export async function addGuest(eventId: string, input: GuestInput): Promise<Guest> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .insert({ event_id: eventId, ...input })
    .select(GUEST_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateGuest(eventId: string, guestId: string, input: GuestInput): Promise<Guest> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .update(input)
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select(GUEST_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateGuestStatus(eventId: string, guestId: string, status: RsvpStatus): Promise<Guest> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .update({ rsvp_status: status })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select(GUEST_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateGuestSide(eventId: string, guestId: string, side: GuestSide | null): Promise<Guest> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .update({ side })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select(GUEST_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export const OTHER_SIDE_ERROR = "Како ко-организатор можете да менувате само гости од вашата страна.";

/**
 * A12: a co-organizer sees every guest but manages only their own side's.
 * `organizerSide` is null for the couple's own login, which may do anything.
 */
export async function assertGuestOnSide(eventId: string, guestId: string, organizerSide: GuestSide | null): Promise<void> {
  if (!organizerSide) return;
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_guests").select("side").eq("id", guestId).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  if (data && data.side !== organizerSide) throw new Error(OTHER_SIDE_ERROR);
}

export async function deleteGuest(eventId: string, guestId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client.from("event_guests").delete().eq("id", guestId).eq("event_id", eventId);
  if (error) throw error;
}

/** One guest from a CSV the couple uploads (see `parseGuestCsv`). */
export interface GuestImportInput {
  full_name: string;
  phone: string | null;
  email: string | null;
  side: GuestSide | null;
  party_size: number;
}

/**
 * Adds uploaded guests in one insert (A20). A name already on the list (or
 * repeated in the file) is skipped, so uploading the same file twice adds
 * nobody twice. Refuses, adding nothing, past the list bound.
 */
export async function importGuests(eventId: string, rows: GuestImportInput[]): Promise<{ imported: number; skipped: number }> {
  const existing = await listGuests(eventId);
  const seen = new Set(existing.map((g) => g.full_name.trim().toLowerCase()));
  const fresh = rows.filter((r) => {
    const key = r.full_name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (existing.length + fresh.length > MAX_LIST_ROWS) {
    throw new Error(`Листата може да има најмногу ${MAX_LIST_ROWS} гости.`);
  }
  if (fresh.length > 0) {
    const client = createServiceRoleClient();
    const { error } = await client
      .from("event_guests")
      .insert(fresh.map((r) => ({ event_id: eventId, ...r, full_name: r.full_name.trim() })), { defaultToNull: false });
    if (error) throw error;
  }
  return { imported: fresh.length, skipped: rows.length - fresh.length };
}

export async function getGuestStats(eventId: string): Promise<GuestStats> {
  const guests = await listGuests(eventId);
  const attending = guests.filter((g) => g.rsvp_status === "confirmed");
  const menu: GuestStats["menu"] = { standard: 0, posno: 0, vegetarian: 0, unset: 0 };
  for (const g of attending) menu[g.menu_choice ?? "unset"] += g.party_size;
  return {
    total: guests.length,
    confirmed: guests.filter((g) => g.rsvp_status === "confirmed").length,
    declined: guests.filter((g) => g.rsvp_status === "declined").length,
    pending: guests.filter((g) => g.rsvp_status === "pending").length,
    invited: guests.filter((g) => g.rsvp_status === "invited").length,
    later: guests.filter((g) => g.rsvp_status === "later").length,
    totalAttending: attending.reduce((sum, g) => sum + g.party_size, 0),
    childrenAttending: attending.reduce((sum, g) => sum + g.children_count, 0),
    menu,
    invitationsSent: guests.filter((g) => g.invitation_sent_at !== null).length,
  };
}

/** Postgres/PostgREST codes for "no such function": seating has not shipped `guest_seat()` yet. */
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);

/**
 * The guest's table and seat, or null when unseated, not this event's guest,
 * or the seating plan does not provide `guest_seat()` (yet).
 */
export async function getGuestSeat(eventId: string, guestId: string): Promise<GuestSeat | null> {
  const client = createServiceRoleClient();
  const { data: guest, error: guestError } = await client
    .from("event_guests")
    .select("id")
    .eq("id", guestId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (guestError) throw guestError;
  if (!guest) return null;

  const { data, error } = await client.rpc("guest_seat", { p_guest_id: guestId });
  if (error) {
    if (MISSING_FUNCTION.has(error.code)) return null;
    throw error;
  }
  const rows = (data ?? []) as GuestSeat[];
  return rows[0] ?? null;
}
