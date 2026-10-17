import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { verifyVenueManager, createManagerElevation } from "@/lib/venue/manager-elevation";
import { getPasswordResetNoticeAt } from "@/lib/venue/managers";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, MANAGER_ELEVATION_REQUIRED_ERROR, managerElevationBody } from "@/lib/api/schemas";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/log";

// SEC-022 style: one message for a wrong password, an unknown manager name,
// and a locked account, so the response never confirms a name exists.
const ELEVATION_FAILED_MESSAGE = "Неточно име или лозинка. По повеќе неуспешни обиди се блокира привремено.";

export const POST = withPublic(
  async ({ request, body }) => {
    const limit = await checkRateLimit(RATE_LIMITS.managerElevation, clientIp(request));
    if (!limit.ok) return rateLimitedResponse(limit);

    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: "Сесијата истече. Најавете се повторно." }, { status: 401 });

    try {
      const result = await verifyVenueManager(venueId, body.name, body.password);
      if ("errorCode" in result) {
        logSecurityEvent(result.errorCode === "locked" ? "manager_elevation_locked" : "manager_elevation_failed", { venue_id: venueId });
        return NextResponse.json({ error: ELEVATION_FAILED_MESSAGE }, { status: 401 });
      }
      logSecurityEvent("manager_elevation_succeeded", { venue_id: venueId, manager_id: result.managerId });
      const elevation = await createManagerElevation(venueId, result.managerId, result.managerName, result.isOwner);
      const passwordResetNoticeAt = await getPasswordResetNoticeAt(result.managerId);
      return NextResponse.json({
        token: elevation.token,
        expiresAt: elevation.expiresAt.toISOString(),
        managerName: elevation.managerName,
        isOwner: elevation.isOwner,
        passwordResetNoticeAt,
      });
    } catch (err) {
      return errorResponse(err, "Најавата како менаџер не успеа. Обидете се повторно.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: managerElevationBody, invalidBodyError: MANAGER_ELEVATION_REQUIRED_ERROR },
);
