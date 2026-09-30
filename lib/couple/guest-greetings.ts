import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { eventHasFeature } from "@/lib/entitlements/server";
import { listGreetings, type Greeting } from "@/lib/media/greetings";
import { greetingMatchesGuest } from "@/lib/couple/rsvp-match";

/**
 * A7: the visible greetings a guest signed, for their detail panel. Matched
 * by name (greetings carry no guest id); nothing when the guest is not this
 * event's or the package has no greetings.
 */
export async function listGreetingsForGuest(eventId: string, guestId: string): Promise<Greeting[]> {
  const client = createServiceRoleClient();
  const { data: guest, error } = await client.from("event_guests").select("full_name").eq("id", guestId).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  if (!guest) return [];
  if (!(await eventHasFeature(eventId, "guest_greetings"))) return [];
  const greetings = await listGreetings(eventId);
  return greetings.filter((g) => greetingMatchesGuest(guest.full_name, g.firstName, g.lastName));
}
