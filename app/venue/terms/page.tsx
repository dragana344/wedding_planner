import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenue } from "@/lib/venue/current-venue";
import { termsUpdatePending, venueOwnerName } from "@/lib/venue/onboarding";
import { TermsAcceptance } from "@/components/venue/onboarding/TermsAcceptance";

export const dynamic = "force-dynamic";

// A newer version of the Terms than the venue accepted (the panel's
// TermsUpdateBanner links here). The owner accepts in the panel; nothing is
// blocked meanwhile. With nothing to accept, back to the dashboard.
export default async function VenueTermsPage() {
  const supabase = await createServerSupabaseClient();
  const venue = await getCurrentVenue(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venue) return null;

  const { data } = await supabase.from("venues").select("terms_version").eq("id", venue.id).maybeSingle<{ terms_version: string | null }>();
  if (!termsUpdatePending(data?.terms_version)) redirect("/venue");

  return <TermsAcceptance embedded venueName={venue.name} ownerName={(await venueOwnerName(venue.id)) ?? ""} />;
}
