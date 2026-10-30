import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listEventPrivateDetails } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withRequestLog } from "@/lib/api/handler";

/**
 * The couple's contacts and each event's price/deposit for the Настани
 * screen — manager/owner only. Plain staff sessions can't read these columns
 * at all (migration 0117), so the page sends events without them and the
 * screen asks here once a manager has logged in.
 */
export async function GET(request: Request) {
  return withRequestLog(request, async () => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    if (!(await requireManagerElevation(request, venueId))) {
      return NextResponse.json({ error: "Потребна е најава како менаџер." }, { status: 403 });
    }
    try {
      return NextResponse.json({ events: await listEventPrivateDetails(venueId, createServiceRoleClient()) });
    } catch (err) {
      return errorResponse(err, "Податоците не можеа да се вчитаат.", request);
    }
  });
}
