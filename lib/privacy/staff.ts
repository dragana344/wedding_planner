import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export { confirmationMatches } from "@/lib/privacy/confirm";

export type StaffCaller = { userId: string; venueId: string };

/**
 * The signed-in venue staff member behind this request (cookie session,
 * RLS-bound client), or null. Venue privacy routes act only on this venue.
 *
 * The `venues(id)` embed is RLS-gated by is_venue_staff_for, which refuses a
 * blocked venue (migration 0048), while the venue_staff row itself stays
 * visible — so a null embed means "blocked" and the caller is treated like
 * non-staff: a blocked venue loses the self-service privacy actions
 * (export/erase/delete) and such requests go through the platform admin
 * (DECISIONS.md).
 */
export async function currentStaff(): Promise<StaffCaller | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("venue_staff").select("venue_id, venues(id)").eq("user_id", user.id).limit(1).maybeSingle();
  const venue = data?.venues as { id: string } | { id: string }[] | null | undefined;
  const venueId = Array.isArray(venue) ? venue[0]?.id : venue?.id;
  return data?.venue_id && venueId ? { userId: user.id, venueId: data.venue_id as string } : null;
}
