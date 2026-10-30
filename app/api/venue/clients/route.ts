import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listEventsWithDetails } from "@/lib/venue/events";
import { listRooms } from "@/lib/venue/rooms";
import { listMenuTemplatesWithItems } from "@/lib/venue/menus";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withRequestLog } from "@/lib/api/handler";

/** Клиенти (B?): every event plus contact info, manager/owner only — the
 * route itself re-verifies elevation (never trust the page's client-side
 * check alone) so an unelevated session never receives the data at all. */
export async function GET(request: Request) {
  return withRequestLog(request, async () => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: "Потребна е најава како менаџер." }, { status: 403 });

    try {
      const [events, rooms, menuTemplates] = await Promise.all([
        // Contacts and money aren't readable by the staff session (0117);
        // the elevation check above is what authorises this read.
        listEventsWithDetails(venueId, createServiceRoleClient(), { includePrivate: true }),
        listRooms(venueId, supabase),
        listMenuTemplatesWithItems(venueId, supabase),
      ]);
      return NextResponse.json({ venueId, events, rooms, menuTemplates });
    } catch (err) {
      return errorResponse(err, "Клиентите не можеа да се вчитаат.", request);
    }
  });
}
