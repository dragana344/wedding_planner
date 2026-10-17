import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { updateVenueBrandColor, updateVenueName, updateVenueProfile } from "@/lib/venue/venue-profile";
import { setLayoutLockPassword } from "@/lib/venue/floorplan";
import { NOT_AUTHENTICATED_ERROR, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, NAME_MAX } from "@/lib/api/schemas";

// Поставки is owner-only (spec D4), and since 0106 staff have no UPDATE on
// venues at all — the owner-elevation check here is the write's real
// authorization; the write itself uses the service-role client, scoped to
// the caller's own venue id.

const OWNER_REQUIRED_ERROR = "Потребна е најава како сопственик.";

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
    // request's own session (the shared login), same as the browser used to
    // — so their error messages are already the same ones the browser used
    // to show (Supabase's own, in English), not a leak of anything new;
    // returned as-is instead of through the generic fallback below.
    if (body.field === "account_email") {
      const { error } = await supabase.auth.updateUser({ email: body.email });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    if (body.field === "account_password") {
      const { error } = await supabase.auth.updateUser({ password: body.password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
