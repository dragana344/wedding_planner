import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { getVenueProfile, updateVenueBrandColor, updateVenueName, updateVenueProfile, venueLogoUrl } from "@/lib/venue/venue-profile";
import { setLayoutLockPassword } from "@/lib/venue/floorplan";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic, withRequestLog } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, NAME_MAX } from "@/lib/api/schemas";
import { authErrorMessage } from "@/lib/auth-messages";

// Поставки is owner-only (spec D4), and since 0107 staff have no UPDATE on
// venues at all — the owner-elevation check here is the write's real
// authorization; the write itself uses the service-role client, scoped to
// the caller's own venue id.

const OWNER_REQUIRED_ERROR = "Потребна е најава како сопственик.";

/** Already signed in, so "…Најавете се." from the sign-in mapping doesn't fit here. */
function accountErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "email_exists" || error.code === "user_already_exists") return "Веќе постои сметка со овој email.";
  return authErrorMessage(error);
}

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

// The page's own data, owner-only (same gate as every write below) — the
// page component no longer fetches this unconditionally server-side, so an
// unelevated visitor is never sent the venue's own email/address/phone at all.
export async function GET(request: Request) {
  return withRequestLog(request, async () => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    if (!(await requireOwnerElevation(request, venueId))) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const profile = await getVenueProfile(venueId, supabase);
      // Branding (0087) is read on its own and never fails the request: a
      // database without the column yet simply omits the branding section.
      const branding = await readBranding(venueId);

      return NextResponse.json({
        venueName: profile.name,
        email: user?.email ?? "",
        profile: { address: profile.address, phone: profile.phone, logoUrl: venueLogoUrl(supabase, profile.logo_path) },
        branding: branding ?? undefined,
      });
    } catch (err) {
      return errorResponse(err, "Поставките не можеа да се вчитаат.", request);
    }
  });
}

const settingsBody = z.discriminatedUnion("field", [
  z.object({ field: z.literal("name"), name: z.string().trim().min(1).max(NAME_MAX) }),
  z.object({ field: z.literal("profile"), address: z.string().max(300).nullable(), phone: z.string().max(50).nullable() }),
  z.object({ field: z.literal("brand_color"), color: z.string().max(20).nullable() }),
  z.object({ field: z.literal("layout_password"), password: z.string().min(1).max(200) }),
  // Final review finding: the shared login's own email/password went
  // straight from the browser to Supabase Auth (supabase.auth.updateUser),
  // which only checks "is there a valid session" — any staff member could
  // change either from devtools even though the Settings page hides the
  // fields from them. Routed through here so the owner-elevation check
  // above is the real gate, not just the page.
  z.object({ field: z.literal("account_email"), email: z.string().trim().email().max(320) }),
  z.object({ field: z.literal("account_password"), password: z.string().min(6).max(200) }),
]);

export const PATCH = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    if (!(await requireOwnerElevation(request, venueId))) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });

    // account_email/account_password call Supabase Auth directly with this
    // request's own session (the shared login). Its errors are English, so
    // they go through the same Macedonian mapping as the sign-in screens.
    if (body.field === "account_email") {
      const { error } = await supabase.auth.updateUser({ email: body.email });
      if (error) return NextResponse.json({ error: accountErrorMessage(error) }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    if (body.field === "account_password") {
      const { error } = await supabase.auth.updateUser({ password: body.password });
      if (error) return NextResponse.json({ error: accountErrorMessage(error) }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const client = createServiceRoleClient();
    if (body.field === "name") await updateVenueName(venueId, body.name, client);
    else if (body.field === "profile") await updateVenueProfile(venueId, { address: body.address, phone: body.phone }, client);
    else if (body.field === "brand_color") await updateVenueBrandColor(venueId, body.color, client);
    else await setLayoutLockPassword(venueId, body.password, client);
    return NextResponse.json({ ok: true });
  },
  {
    invalidJsonError: INVALID_JSON_ERROR,
    body: settingsBody,
    invalidBodyError: "Неважечки податоци.",
    fallbackError: "Не успеа зачувувањето. Обидете се повторно.",
  },
);
