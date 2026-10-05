import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";
import { matchGuestByName } from "@/lib/couple/rsvp-match";
import { getGuestSeat, type GuestSeat } from "@/lib/couple/guests";
import { eventHasFeature } from "@/lib/entitlements/server";

// A15/A16: where a guest sits, for the guest's own page (personal link) and
// the public "Каде седам?" lookup. `found: false` covers an unknown guest, a
// shared name and another event's guest alike, so the lookup never tells a
// stranger whether a name is on the list; the answer is only a table.

export type SeatLookup = { found: boolean; seat: GuestSeat | null };

const NOT_FOUND: SeatLookup = { found: false, seat: null };
const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

/** The invitation's event, when its package includes seating (else no table is ever shown). */
async function eventIdForSlug(slug: string): Promise<string | null> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_invitations").select("event_id").eq("public_slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await eventHasFeature(data.event_id, "seating")) ? data.event_id : null;
}

export async function getSeatByToken(slug: string, token: string): Promise<SeatLookup> {
  if (!TOKEN_RE.test(token)) return NOT_FOUND;
  const eventId = await eventIdForSlug(slug);
  if (!eventId) return NOT_FOUND;
  const client = createServiceRoleClient();
  const { data: guest, error } = await client
    .from("event_guests")
    .select("id, rsvp_status")
    .eq("event_id", eventId)
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!guest) return NOT_FOUND;
  if (guest.rsvp_status === "declined") return NOT_FOUND;
  return { found: true, seat: await getGuestSeat(eventId, guest.id) };
}

export async function findSeatByName(slug: string, name: string): Promise<SeatLookup> {
  if (!name.trim()) return NOT_FOUND;
  const eventId = await eventIdForSlug(slug);
  if (!eventId) return NOT_FOUND;
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_guests").select("id, full_name, rsvp_status").eq("event_id", eventId).limit(MAX_LIST_ROWS);
  if (error) throw error;
  const guest = matchGuestByName(checkListBound(data, "event_guests (seat lookup)"), name);
  if (guest) {
    // A guest who declined is not coming: no table, even if the couple has
    // not yet taken them off the plan.
    if (guest.rsvp_status === "declined") return NOT_FOUND;
    return { found: true, seat: await getGuestSeat(eventId, guest.id) };
  }
  // Someone the couple wrote straight onto a chair (no guest-list row, e.g.
  // an older relative without a phone) looks up their table the same way.
  const typed = await findTypedSeat(eventId, name);
  return typed ? { found: true, seat: typed } : NOT_FOUND;
}

/** The seat holding a hand-typed name that matches, when exactly one does. */
async function findTypedSeat(eventId: string, name: string): Promise<GuestSeat | null> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_seat_assignments")
    .select("id, guest_name, seat_number, room_id, layout_element_id")
    .eq("event_id", eventId)
    .is("guest_id", null)
    .not("guest_name", "is", null)
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  const rows = checkListBound(data, "event_seat_assignments (seat lookup)").map((r) => ({ ...r, full_name: r.guest_name as string }));
  const seat = matchGuestByName(rows, name);
  if (!seat) return null;
  const [tables, room] = await Promise.all([
    client.rpc("event_room_tables", { p_event_id: eventId, p_room_id: seat.room_id }),
    client.from("rooms").select("name").eq("id", seat.room_id).maybeSingle(),
  ]);
  if (tables.error) throw tables.error;
  if (room.error) throw room.error;
  const table = ((tables.data ?? []) as { element_id: string; label: string | null; ord: number }[]).find((t) => t.element_id === seat.layout_element_id);
  if (!table) return null;
  return { table_label: table.label ?? `Маса ${table.ord}`, seat_number: seat.seat_number, room_name: room.data?.name ?? null };
}
