import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { brandVars, type BrandVars } from "@/lib/venue/brand-palette";
import { venueLogoUrl } from "@/lib/venue/venue-profile";

// Venue branding (0087): what a venue's panels and its couples' and guests'
// pages show instead of the platform's own mark and gold — when the venue's
// plan includes `venue_branding`. Without the feature this is NO_BRANDING and
// every page looks as it did before.

export type VenueBranding = {
  /** The venue's logo, to show in place of the platform mark. */
  logoUrl: string | null;
  /** CSS custom properties for the panels' accent family. */
  vars: BrandVars | null;
  /** The accent itself, for pages that take one colour (guest pages). */
  color: string | null;
};

export const NO_BRANDING: VenueBranding = { logoUrl: null, vars: null, color: null };

/**
 * `enabled` lets a caller that already resolved the venue's features pass the
 * answer instead of asking again. Never throws: branding is decoration, and a
 * failure here (including a database that does not have 0087 yet) must not
 * take a page down with it.
 */
export async function getVenueBranding(venueId: string, enabled?: boolean): Promise<VenueBranding> {
  try {
    const on = enabled ?? (await getVenueFeatures(venueId)).venue_branding.enabled;
    if (!on) return NO_BRANDING;
    const client = createServiceRoleClient();
    const { data, error } = await client.from("venues").select("logo_path, brand_color").eq("id", venueId).maybeSingle();
    if (error || !data) return NO_BRANDING;
    const vars = brandVars(data.brand_color);
    return { logoUrl: venueLogoUrl(client, data.logo_path), vars, color: vars ? vars["--gold"] : null };
  } catch {
    return NO_BRANDING;
  }
}

/** The branding of the venue that hosts this event. */
export async function getEventBranding(eventId: string): Promise<VenueBranding> {
  try {
    const { data, error } = await createServiceRoleClient().from("events").select("venue_id").eq("id", eventId).maybeSingle();
    if (error || !data) return NO_BRANDING;
    return getVenueBranding(data.venue_id);
  } catch {
    return NO_BRANDING;
  }
}
