import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getVenueProfile, venueLogoUrl } from "@/lib/venue/venue-profile";
import { SettingsClient } from "@/components/venue/dashboard/SettingsClient";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Same stale-Router-Cache fix as /venue/reservations.
export const dynamic = "force-dynamic";

async function readBranding(venueId: string): Promise<{ color: string | null; enabled: boolean } | null> {
  try {
    const [features, row] = await Promise.all([
      getVenueFeatures(venueId),
      createServiceRoleClient().from("venues").select("brand_color").eq("id", venueId).maybeSingle(),
    ]);
    if (row.error) return null;
    return { color: (row.data?.brand_color as string | null) ?? null, enabled: features.venue_branding.enabled };
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getVenueProfile(venueId, supabase);
  // Branding (0087) is read on its own and never fails the page: a database
  // without the column yet simply shows no branding section.
  const branding = await readBranding(venueId);

  return (
    <SettingsClient
      venueId={venueId}
      venueName={profile.name}
      email={user?.email ?? ""}
      profile={{ address: profile.address, phone: profile.phone, logoUrl: venueLogoUrl(supabase, profile.logo_path) }}
      branding={branding ?? undefined}
    />
  );
}
