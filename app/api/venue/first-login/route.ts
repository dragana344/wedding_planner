import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { clearMustChangePassword, mustChangePassword } from "@/lib/venue/onboarding";
import { NOT_AUTHENTICATED_ERROR, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, newPassword } from "@/lib/api/schemas";
import { PASSWORD_LENGTH_ERROR } from "@/lib/security/password";
import { authErrorMessage } from "@/lib/auth-messages";
import { recordAudit } from "@/lib/audit";

const firstLoginBody = z.object({ password: newPassword });

/**
 * POST /api/venue/first-login: replaces the sign-in password the admin
 * generated ("Нов локал") with the owner's own. Changing the shared login's
 * password otherwise needs owner elevation (Поставки), so this only works
 * while the account still carries app_metadata.must_change_password.
 */
export const POST = withPublic(
  async ({ body }) => {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const venueId = user ? await getCurrentVenueId(supabase) : null;
    if (!user || !venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    if (!mustChangePassword(user)) return NextResponse.json({ error: "Лозинката е веќе поставена." }, { status: 409 });

    const { error } = await supabase.auth.updateUser({ password: body.password });
    if (error) return NextResponse.json({ error: authErrorMessage(error) }, { status: 400 });
    await clearMustChangePassword(user.id);
    // SEC-017: a password change ends the sessions on other devices.
    await supabase.auth.signOut({ scope: "others" });
    await recordAudit({ action: "venue_first_password_set", actorType: "staff", actorId: user.id, venueId });
    return NextResponse.json({ ok: true });
  },
  {
    invalidJsonError: INVALID_JSON_ERROR,
    body: firstLoginBody,
    invalidBodyError: PASSWORD_LENGTH_ERROR,
    fallbackError: "Не успеа зачувувањето. Обидете се повторно.",
  },
);
