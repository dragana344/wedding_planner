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
import { listVenueNotifications } from "@/lib/venue/notifications";
import { errorFields, log } from "@/lib/log";
import { onboardingStep, termsUpdatePending, venueOwnerName } from "@/lib/venue/onboarding";
import { LEGAL_VERSION } from "@/lib/legal/facts";
import { FirstLoginPassword } from "@/components/venue/onboarding/FirstLoginPassword";
import { TermsAcceptance } from "@/components/venue/onboarding/TermsAcceptance";
import "./panel.css";
import "./mobile-venue.css";
import "./mobile-venue-dash.css";
import "./mobile-venue-res.css";

// Private area: keep out of search engines (COMP-004).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VenueLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const access = await getVenueAccess(supabase);

  // Admin spec D8: a blocked venue's staff get BlockedScreen, not the panel
  // (and never /login — they *are* staff, just blocked).
  // 0172: a scheduled deletion still shows its date there, with the owner's
  // data export (the panel's banner and Поставки are out of reach).
  if (access.status === "blocked") {
    // A failed lookup only hides the export form (the screen says to contact us).
    const hasOwner = access.deletionScheduledFor ? (await venueOwnerName(access.venueId).catch(() => null)) !== null : false;
    return <BlockedScreen reason={access.reason} deletionScheduledFor={access.deletionScheduledFor} hasOwner={hasOwner} />;
  }
  if (access.status === "none") {
    redirect("/login");
  }

  // 0172: an admin-scheduled deletion (the banner asks the venue to download
  // its data before that date), and the accepted Terms version. A failed
  // read is logged; it only hides the banner and skips the terms screen.
  const { data: venueRow, error: venueRowError } = await supabase
    .from("venues")
    .select("deletion_scheduled_for, terms_version")
    .eq("id", access.venue.id)
    .maybeSingle<{ deletion_scheduled_for: string | null; terms_version: string | null }>();
  if (venueRowError) log("error", "venue_row_read_failed", { venue_id: access.venue.id, ...errorFields(venueRowError) });

  // First login of an admin-opened venue, then the Terms (lib/venue/onboarding.ts).
  // getUser, not the session's claims: the flag is cleared server-side and
  // the cookie's JWT would still carry it until the next refresh. Only a
  // venue that never accepted the Terms gets the blocking screen; a newer
  // version is a banner (termsUpdatePending) so staff are never locked out.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const termsVersion = venueRowError ? LEGAL_VERSION : venueRow?.terms_version;
  const step = onboardingStep(user, termsVersion);
  if (step === "password") return <FirstLoginPassword />;
  if (step === "terms") return <TermsAcceptance venueName={access.venue.name} ownerName={(await venueOwnerName(access.venue.id)) ?? ""} />;

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

  // Same signal as Известувања's own page (a couple's or the venue's own
  // staff's changes the other side hasn't opened yet) — so Известувања gets
  // a visible marker in the sidebar instead of only showing up once opened.
  // A plain dot (not a count), matching the couple nav's own unseen-dot —
  // "something changed in some event" is the useful signal here, not a tally.
  let hasUnseenNotifications = false;
  try {
    hasUnseenNotifications = (await listVenueNotifications(supabase, access.venue.id)).some((n) => n.unseen);
  } catch (err) {
    log("error", "venue_notifications_badge_failed", { venue_id: access.venue.id, ...errorFields(err) });
    hasUnseenNotifications = false;
  }

  return (
    <PanelShell
      venueName={access.venue.name}
      deletionScheduledFor={venueRow?.deletion_scheduled_for ?? null}
      termsUpdatePending={termsUpdatePending(termsVersion)}
      lockedFeatures={lockedFeatures}
      brand={brand}
      badges={{ "/venue/events": eventsBadge }}
      dots={{ "/venue/notifications": hasUnseenNotifications }}
    >
      {children}
    </PanelShell>
  );
}
