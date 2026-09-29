import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

export type RsvpStatus = "invited" | "confirmed" | "declined" | "pending" | "later";
export type GuestSide = "bride" | "groom";

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
}

export interface GuestInput {
  full_name: string;
  phone: string | null;
  party_size: number;
  notes: string | null;
  side: GuestSide | null;
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
}

const COLUMNS = "id, event_id, full_name, phone, party_size, rsvp_status, notes, side, rsvp_changed_via_link_at, rsvp_previous_status";

export async function listGuests(eventId: string): Promise<Guest[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .select(COLUMNS)
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
    .select(COLUMNS)
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
    .select(COLUMNS)
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
    .select(COLUMNS)
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
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGuest(eventId: string, guestId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client.from("event_guests").delete().eq("id", guestId).eq("event_id", eventId);
  if (error) throw error;
}

export async function getGuestStats(eventId: string): Promise<GuestStats> {
  const guests = await listGuests(eventId);
  return {
    total: guests.length,
    confirmed: guests.filter((g) => g.rsvp_status === "confirmed").length,
    declined: guests.filter((g) => g.rsvp_status === "declined").length,
    pending: guests.filter((g) => g.rsvp_status === "pending").length,
    invited: guests.filter((g) => g.rsvp_status === "invited").length,
    later: guests.filter((g) => g.rsvp_status === "later").length,
    totalAttending: guests.filter((g) => g.rsvp_status === "confirmed").reduce((sum, g) => sum + g.party_size, 0),
  };
}
