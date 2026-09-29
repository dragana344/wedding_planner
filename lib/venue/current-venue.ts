import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentVenue = { id: string; name: string };

/**
 * Resolves the currently signed-in staff member's venue (id + name), via the
 * request-scoped (RLS-bound) `supabase` client's `auth.getUser()` plus one
 * `venue_staff` lookup joined to `venues`. Returns null if there is no
 * signed-in user, or the signed-in user has no staff row (e.g. a couple
 * account, or an unprovisioned user).
 *
 * Memoized per client with React `cache()`: the venue layout and the page it
 * wraps share one request-scoped client (see createServerSupabaseClient), so
 * they share one lookup instead of each paying the Supabase round trips.
 * Outside a server render (browser, route handlers, tests) `cache()` is a
 * pass-through.
 */
export const getCurrentVenue = cache(
  async (supabase: SupabaseClient): Promise<CurrentVenue | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: staffRow } = await supabase
      .from("venue_staff")
      .select("venue_id, venues(name)")
      .eq("user_id", user.id)
      .single();
    if (!staffRow) return null;

    const venue = staffRow.venues as { name: string } | { name: string }[] | null;
    const name = (Array.isArray(venue) ? venue[0]?.name : venue?.name) ?? "Локал";
    return { id: staffRow.venue_id, name };
  }
);

export async function getCurrentVenueId(supabase: SupabaseClient): Promise<string | null> {
  return (await getCurrentVenue(supabase))?.id ?? null;
}
