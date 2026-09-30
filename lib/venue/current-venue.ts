import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentVenue = { id: string; name: string };

/**
 * Resolves the currently signed-in staff member's venue (id + name), via the
 * request-scoped (RLS-bound) `supabase` client's `auth.getUser()` plus one
 * `venue_staff` lookup joined to `venues`. Returns null if there is no
 * signed-in user, or the signed-in user has no staff row (e.g. a couple
 * account, or an unprovisioned user, or — since the `venues` embed is itself
 * RLS-gated by `is_venue_staff_for`, migration 0048 — a *blocked* venue's
 * staff, whose embed comes back null even though their `venue_staff` row is
 * visible). Callers that must tell "blocked" apart from "no such staff" (the
 * venue panel layout) use lib/venue/venue-access.ts instead.
 *
 * Client-safe on purpose: no service-role import, no "server-only" — this is
 * called directly from a browser client in
 * app/venue/events/new/page.tsx ("use client"), so it must stay bundleable
 * into client code.
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

    // A null embed means RLS hid the venue (blocked) — see the doc comment.
    const venue = staffRow.venues as { name: string } | { name: string }[] | null;
    const name = Array.isArray(venue) ? venue[0]?.name : venue?.name;
    if (name == null) return null;
    return { id: staffRow.venue_id, name };
  }
);

export async function getCurrentVenueId(supabase: SupabaseClient): Promise<string | null> {
  return (await getCurrentVenue(supabase))?.id ?? null;
}
