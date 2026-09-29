import "server-only";
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
  // REL-005: venue + staff row in one transaction (migration 0041).
  const { data, error } = await createServiceRoleClient().rpc("provision_venue", {
    p_user_id: userId,
    p_venue_name: venueName,
  });
  if (error) throw error;
  return { venue_id: data as string };
}

/**
 * COMP-001 / R1-06: records that the venue accepted `termsVersion` of the
 * Terms of Service (which include the Data Processing Agreement), now.
 * Idempotent: a venue that already accepted this version keeps its original
 * timestamp, so a retried signup does not move it. Service role only; a
 * trigger (migration 0046) stops browser clients from writing these columns.
 */
export async function recordTermsAcceptance(venueId: string, termsVersion: string): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from("venues")
    .update({ terms_version: termsVersion, terms_accepted_at: new Date().toISOString() })
    .eq("id", venueId)
    .or(`terms_version.is.null,terms_version.neq."${termsVersion}"`);
  if (error) throw error;
}
