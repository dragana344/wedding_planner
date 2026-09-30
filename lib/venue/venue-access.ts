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
 * venue's staff (BlockedScreen) apart from someone who isn't staff at all,
 * or an MFA-enrolled staff member who hasn't passed the second factor yet
 * (SEC-016: must still be sent to /login's code step, not BlockedScreen).
 *
 * Server-only (service-role client): distinct from the client-safe
 * lib/venue/current-venue.ts, which every other venue page (including a
 * "use client" one) calls for just an id/name and must never pull in
 * "server-only".
 *
 * Two RLS facts make one round trip enough for the common (non-blocked)
 * case:
 *  - `venue_staff`'s own SELECT policy (migration 0044) only checks
 *    `user_id = auth.uid() and staff_mfa_satisfied()` — it has no
 *    `blocked_at` check. So an aal1 session of an MFA-enrolled user still
 *    gets no row here (staff_mfa_satisfied() is false), exactly like a true
 *    non-staff user: both resolve to "none".
 *  - `venues`' own SELECT policy (migration 0004) is `is_venue_staff_for(id)`,
 *    which migration 0048 extended to also require `blocked_at is null`. So
 *    for a *blocked* venue the `venue_staff` row is still visible (its own
 *    policy never looks at blocked_at) but the embedded `venues(...)` comes
 *    back null — and it can only be null for that reason, because
 *    `staff_mfa_satisfied()` already had to be true for the outer row to be
 *    visible at all in the same request/session.
 *
 * So: no staff row → "none" (covers both "not staff" and "aal1 MFA", keeping
 * proxy.ts's "layout finds no staff row → /login" MFA redirect intact —
 * see tests/supabase/mfa_staff.test.ts). A staff row with a null `venues`
 * embed → genuinely blocked; only then is a second, service-role round trip
 * spent to read the block reason (RLS would just hide it again). A staff row
 * with the embed present → "ok". Non-blocked users still pay exactly the one
 * round trip current-venue.ts always did.
 *
 * Memoized per client with React `cache()`, same rationale as
 * lib/venue/current-venue.ts's getCurrentVenue.
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
