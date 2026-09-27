import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Creates a venue for a brand-new self-signed-up user and links them as its
 * staff, in one operation. Idempotent: if the given user already has a
 * venue_staff row (e.g. this is a retry after a prior partial failure), that
 * existing venue's id is returned instead of creating a second venue.
 *
 * Always uses the service-role client — venue_staff is never written via a
 * direct client grant (see supabase/migrations/0004_rls_policies.sql) — and
 * always takes an already-resolved userId from the caller's own session,
 * never a client-supplied value.
 */
export async function provisionVenueForUser(userId: string, venueName: string): Promise<{ venue_id: string }> {
  const client = createServiceRoleClient();

  const { data: existing, error: existingError } = await client
    .from("venue_staff")
    .select("venue_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { venue_id: existing.venue_id };

  const { data: venue, error: venueError } = await client
    .from("venues")
    .insert({ name: venueName })
    .select("id")
    .single();
  if (venueError) throw venueError;

  const { error: staffError } = await client
    .from("venue_staff")
    .insert({ user_id: userId, venue_id: venue.id });
  if (staffError) throw staffError;

  return { venue_id: venue.id };
}
