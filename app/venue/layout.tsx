import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVenueAccess } from "@/lib/venue/venue-access";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { FEATURE_KEYS } from "@/lib/entitlements/features";
import { BlockedScreen } from "@/components/venue/BlockedScreen";
import { PanelShell } from "@/components/venue/shell/PanelShell";
import { getVenueBranding } from "@/lib/venue/branding";
import { listUnseenSections } from "@/lib/venue/unseen-changes";
import { errorFields, log } from "@/lib/log";
import "./panel.css";

// Private area: keep out of search engines (COMP-004).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VenueLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const access = await getVenueAccess(supabase);

  // Admin spec D8: a blocked venue's staff get BlockedScreen, not the panel
  // (and never /login — they *are* staff, just blocked).
  if (access.status === "blocked") {
    return <BlockedScreen reason={access.reason} />;
  }
  if (access.status === "none") {
    redirect("/login");
  }

  // The venue id is only known once access resolves to "ok", so this can't
  // run in parallel with getVenueAccess above (admin dashboard spec §4.4).
  const features = await getVenueFeatures(access.venue.id);
  const lockedFeatures = FEATURE_KEYS.filter((k) => !features[k].enabled);
  const brand = await getVenueBranding(access.venue.id, features.venue_branding.enabled);

  // Events with couple changes the venue hasn't seen; a failure here must not break the panel.
  let eventsBadge = 0;
  try {
    eventsBadge = (await listUnseenSections(access.venue.id, supabase)).size;
  } catch (err) {
    log("error", "venue_events_badge_failed", { venue_id: access.venue.id, ...errorFields(err) });
    eventsBadge = 0;
  }

  return (
    <PanelShell venueName={access.venue.name} lockedFeatures={lockedFeatures} brand={brand} badges={{ "/venue/events": eventsBadge }}>
      {children}
    </PanelShell>
  );
}
