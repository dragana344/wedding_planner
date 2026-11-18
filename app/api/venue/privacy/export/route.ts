import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic, withRequestLog } from "@/lib/api/handler";
import { INVALID_JSON_ERROR } from "@/lib/api/schemas";
import { REQUEST_ID_HEADER, logSecurityEvent } from "@/lib/log";
import { exportVenueData } from "@/lib/privacy/export";
import { currentStaff } from "@/lib/privacy/staff";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVenueAccess } from "@/lib/venue/venue-access";
import { venueOwnerName } from "@/lib/venue/onboarding";
import { verifyVenueManager } from "@/lib/venue/manager-elevation";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// DATA-006: venue staff download everything the platform holds for their
// venue as one JSON file.
export const dynamic = "force-dynamic";

async function exportResponse(venueId: string, actorId: string, managerName: string, request: Request): Promise<Response> {
  const data = await exportVenueData(venueId, {
    actorId,
    requestId: request.headers.get(REQUEST_ID_HEADER),
    managerName,
  });
  if (!data) return NextResponse.json({ error: "Локалот не е пронајден." }, { status: 404 });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="podatoci-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  return withRequestLog(request, async () => {
    const staff = await currentStaff();
    if (!staff) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const owner = await requireOwnerElevation(request, staff.venueId);
    if (!owner) return NextResponse.json({ error: "Потребна е најава како сопственик." }, { status: 403 });
    try {
      return await exportResponse(staff.venueId, staff.userId, owner.managerName, request);
    } catch (err) {
      return errorResponse(err, "Не успеа преземањето на податоците.", request);
    }
  });
}

const blockedExportBody = z.object({ password: z.string().min(1).max(200) });
// Same wording as the terms screen: a wrong password and a locked owner login look alike.
const WRONG_PASSWORD = "Неточна лозинка на сопственикот. По повеќе неуспешни обиди се блокира привремено.";

/**
 * POST: the export from BlockedScreen. A block cuts every staff capability
 * (DECISIONS.md), with one exception: when the admin has also scheduled the
 * venue's deletion (0172), the venue was told to download its data first —
 * so its owner can still export, proving who they are with the owner's
 * manager password (rate limit and lockout as an elevation). Any other
 * venue uses GET from Поставки.
 */
export const POST = withPublic(
  async ({ request, body }) => {
    const limit = await checkRateLimit(RATE_LIMITS.managerElevation, clientIp(request));
    if (!limit.ok) return rateLimitedResponse(limit);

    const supabase = await createServerSupabaseClient();
    const access = await getVenueAccess(supabase);
    if (access.status !== "blocked" || !access.deletionScheduledFor) {
      return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const ownerName = await venueOwnerName(access.venueId);
    const result = ownerName ? await verifyVenueManager(access.venueId, ownerName, body.password) : ({ errorCode: "invalid" } as const);
    if ("errorCode" in result || !result.isOwner) {
      logSecurityEvent("blocked_export_owner_check_failed", { venue_id: access.venueId });
      return NextResponse.json({ error: WRONG_PASSWORD }, { status: 401 });
    }
    return exportResponse(access.venueId, user!.id, result.managerName, request);
  },
  {
    invalidJsonError: INVALID_JSON_ERROR,
    body: blockedExportBody,
    invalidBodyError: "Внесете ја лозинката на сопственикот.",
    fallbackError: "Не успеа преземањето на податоците.",
  },
);
