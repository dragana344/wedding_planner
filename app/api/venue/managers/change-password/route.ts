import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { changeManagerPassword } from "@/lib/venue/managers";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { verifyVenueManager } from "@/lib/venue/manager-elevation";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, changeManagerPasswordBody } from "@/lib/api/schemas";
import { logSecurityEvent } from "@/lib/log";

const CURRENT_PASSWORD_WRONG_ERROR = "Тековната лозинка не е точна.";

export const POST = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: "Потребна е најава како менаџер." }, { status: 403 });
    // Re-verifies the account's own password (final review finding: anyone
    // at an unattended computer with a manager already logged in could
    // otherwise change it to lock the real manager out) — the same RPC the
    // login screen uses, so a wrong guess here counts toward that manager's
    // lockout exactly like a wrong login attempt would.
    const verified = await verifyVenueManager(venueId, manager.managerName, body.currentPassword);
    if ("errorCode" in verified) return NextResponse.json({ error: CURRENT_PASSWORD_WRONG_ERROR }, { status: 400 });
    try {
      await changeManagerPassword(manager.managerId, body.newPassword);
      logSecurityEvent("manager_password_changed", { venue_id: venueId, manager_id: manager.managerId });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Лозинката не можеше да се смени.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: changeManagerPasswordBody, invalidBodyError: "Лозинката мора да има најмалку 8 знаци." },
);
