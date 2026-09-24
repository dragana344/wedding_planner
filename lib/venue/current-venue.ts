import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the venue_id of the currently signed-in staff member, via the
 * request-scoped (RLS-bound) `supabase` client's `auth.getUser()` plus a
 * `venue_staff` lookup. Returns null if there is no signed-in user, or the
 * signed-in user has no staff row (e.g. a couple account, or an
 * unprovisioned user).
 */
export async function getCurrentVenueId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: staffRow } = await supabase
    .from("venue_staff")
    .select("venue_id")
    .eq("user_id", user.id)
    .single();

  return staffRow?.venue_id ?? null;
}
