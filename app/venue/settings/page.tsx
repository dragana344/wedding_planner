import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { SettingsClient } from "@/components/venue/dashboard/SettingsClient";

// Same stale-Router-Cache fix as /venue/reservations.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;

  // Owner-only (D4) — SettingsClient fetches the venue's own data itself
  // from /api/venue/settings with the elevation token, so an unelevated
  // session is never sent the owner's email/address/phone at all.
  return <SettingsClient />;
}
