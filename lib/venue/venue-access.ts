import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { CurrentVenue } from "@/lib/venue/current-venue";

export type VenueAccess =
  | { status: "none" }
  | { status: "blocked"; reason: string | null }
  | { status: "ok"; venue: CurrentVenue };

type StaffRow = { venue_id: string; venues: { name: string } | { name: string }[] | null };

/**
 * Resolves the signed-in staff member's venue access for the venue panel
 * layout (app/venue/layout.tsx) — the one place that must tell a *blocked*
 * venue's staff (BlockedScreen) apart from someone who isn't staff at all.
 *
 * Server-only (service-role client): distinct from the client-safe
 * lib/venue/current-venue.ts, which every other venue page (including a
 * "use client" one) calls for just an id/name and must never pull in
 * "server-only".
 *
 * `venue_staff`'s own SELECT policy has no `blocked_at` check, while
 * `venues`' policy (`is_venue_staff_for`, migration 0048) requires
 * `blocked_at is null`. So for a blocked venue the staff row is visible but
 * the embedded `venues(...)` comes back null.
 *
 * So: no staff row → "none". A staff row with a null `venues` embed →
 * blocked; only then is a second, service-role round trip spent to read the
 * block reason (RLS would just hide it again).
 */
export const getVenueAccess = cache(
  async (supabase: SupabaseClient): Promise<VenueAccess> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "none" };

    const { data: staffRow } = await supabase
      .from("venue_staff")
      .select("venue_id, venues(name)")
      .eq("user_id", user.id)
      .maybeSingle<StaffRow>();
    if (!staffRow) return { status: "none" };

    const venue = Array.isArray(staffRow.venues) ? staffRow.venues[0] : staffRow.venues;
    if (venue) {
      return { status: "ok", venue: { id: staffRow.venue_id, name: venue.name } };
    }

    const { data: venueRow, error } = await createServiceRoleClient()
      .from("venues")
      .select("blocked_at, blocked_reason")
      .eq("id", staffRow.venue_id)
      .maybeSingle<{ blocked_at: string | null; blocked_reason: string | null }>();
    // Defensive: the embed above was only ever null because RLS hid a
    // blocked venue (see the doc comment). If the service-role read
    // disagrees — a race with an unblock, or an unexpected error — fail to
    // "none" (redirect to /login) rather than invent a venue name we don't
    // have or grant the panel on an unverified state.
    if (error || !venueRow?.blocked_at) return { status: "none" };
    return { status: "blocked", reason: venueRow.blocked_reason ?? null };
  }
);
