import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export { confirmationMatches } from "@/lib/privacy/confirm";

export type StaffCaller = { userId: string; venueId: string };

/**
 * The signed-in venue staff member behind this request (cookie session,
 * RLS-bound client), or null. Venue privacy routes act only on this venue.
 */
export async function currentStaff(): Promise<StaffCaller | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("venue_staff").select("venue_id").eq("user_id", user.id).limit(1).maybeSingle();
  return data?.venue_id ? { userId: user.id, venueId: data.venue_id as string } : null;
}
