import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getReport } from "@/lib/venue/reports";
import { listRooms } from "@/lib/venue/rooms";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withRequestLog } from "@/lib/api/handler";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  return withRequestLog(request, async () => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: "Потребна е најава како менаџер." }, { status: 403 });
    // A venue whose plan excludes Reports must not get real numbers from
    // this route either — the page already hides it behind SAMPLE_REPORT,
    // but the route itself must independently refuse, the same way every
    // other locked-feature check in this codebase does (lib/api/handler.ts).
    if (!(await getVenueFeatures(venueId)).reports.enabled) {
      return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 403 });
    }

    try {
      const url = new URL(request.url);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const room = url.searchParams.get("room");
      const rooms = await listRooms(venueId, supabase);
      const roomId = rooms.some((r) => r.id === room) ? room! : undefined;
      // Revenue and deposits aren't readable by the staff session (0117);
      // the elevation check above authorises this read, scoped to venueId.
      const report = await getReport(createServiceRoleClient(), venueId, {
        from: from && ISO.test(from) ? from : undefined,
        to: to && ISO.test(to) ? to : undefined,
        roomId,
      });
      return NextResponse.json(report);
    } catch (err) {
      return errorResponse(err, "Извештајот не можеше да се вчита.", request);
    }
  });
}
