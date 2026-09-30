import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";
import { matchGuestByName } from "@/lib/couple/rsvp-match";
import { getGuestSeat, type GuestSeat } from "@/lib/couple/guests";

// A15/A16: where a guest sits, for the guest's own page (personal link) and
// the public "Каде седам?" lookup. `found: false` covers an unknown guest, a
// shared name and another event's guest alike, so the lookup never tells a
// stranger whether a name is on the list; the answer is only a table.

export type SeatLookup = { found: boolean; seat: GuestSeat | null };

const NOT_FOUND: SeatLookup = { found: false, seat: null };
const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

async function eventIdForSlug(slug: string): Promise<string | null> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_invitations").select("event_id").eq("public_slug", slug).maybeSingle();
  if (error) throw error;
  return data?.event_id ?? null;
}

export async function getSeatByToken(slug: string, token: string): Promise<SeatLookup> {
  if (!TOKEN_RE.test(token)) return NOT_FOUND;
  const eventId = await eventIdForSlug(slug);
  if (!eventId) return NOT_FOUND;
  const client = createServiceRoleClient();
  const { data: guest, error } = await client
    .from("event_guests")
    .select("id")
    .eq("event_id", eventId)
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!guest) return NOT_FOUND;
  return { found: true, seat: await getGuestSeat(eventId, guest.id) };
}

export async function findSeatByName(slug: string, name: string): Promise<SeatLookup> {
  if (!name.trim()) return NOT_FOUND;
  const eventId = await eventIdForSlug(slug);
  if (!eventId) return NOT_FOUND;
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_guests").select("id, full_name").eq("event_id", eventId).limit(MAX_LIST_ROWS);
  if (error) throw error;
  const guest = matchGuestByName(checkListBound(data, "event_guests (seat lookup)"), name);
  if (!guest) return NOT_FOUND;
  return { found: true, seat: await getGuestSeat(eventId, guest.id) };
}
