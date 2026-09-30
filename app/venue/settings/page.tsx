import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getVenueProfile, venueLogoUrl } from "@/lib/venue/venue-profile";
import { SettingsClient } from "@/components/venue/dashboard/SettingsClient";

// Same stale-Router-Cache fix as /venue/reservations.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getVenueProfile(venueId!, supabase);

  return (
    <SettingsClient
      venueId={venueId!}
      venueName={profile.name}
      email={user?.email ?? ""}
      profile={{ address: profile.address, phone: profile.phone, logoUrl: venueLogoUrl(supabase, profile.logo_path) }}
    />
  );
}
