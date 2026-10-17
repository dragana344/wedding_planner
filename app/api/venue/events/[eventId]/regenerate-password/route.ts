import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { regenerateEventPassword } from "@/lib/venue/credentials";
import { getEventById } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, regenerateEventPasswordBody, uuid } from "@/lib/api/schemas";
import { logSecurityEvent } from "@/lib/log";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const paramsSchema = z.object({ eventId: uuid });

// Final review finding (venue-manager-staff-login Plan 2): regenerate_event_password
// was callable directly by any authenticated staff session, letting a plain
// staff member reset a couple's login password without manager elevation.
// This route re-verifies elevation (spec D2) and is now the only authenticated
// path to that RPC (migration 0102 revoked the direct grant).
export const POST = withPublic(
  async ({ request, params, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    try {
      const serviceClient = createServiceRoleClient();
      // regenerate_event_password skips its own venue-ownership check
      // entirely when called as service_role (it only runs that check for a
      // plain authenticated caller) — so this route must verify the event
      // belongs to this venue itself, the same pattern as deleteEvent/
      // updateEvent after their switch to the service-role client.
      const event = await getEventById(params.eventId, serviceClient);
      if (!event || event.venue_id !== venueId) {
        return NextResponse.json({ error: "Настанот не е пронајден." }, { status: 404 });
      }
      await regenerateEventPassword(params.eventId, body.password, serviceClient);
      logSecurityEvent("event_password_regenerated", { venue_id: venueId, event_id: params.eventId, manager_id: manager.managerId });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Не успеа генерирањето на нова лозинка.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: regenerateEventPasswordBody, params: paramsSchema, invalidBodyError: "Невалидна лозинка." },
);
