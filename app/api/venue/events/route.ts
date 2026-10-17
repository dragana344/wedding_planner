import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { createEvent } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, createEventBody } from "@/lib/api/schemas";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";

export const POST = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    try {
      // The elevation check above is the real authorization now; RLS limits
      // the signed-in staff session's own writes to a few unguarded columns
      // (migration 0095), so the actual write uses the service-role client.
      const event = await createEvent({ ...body, venue_id: venueId }, createServiceRoleClient());
      return NextResponse.json(event);
    } catch (err) {
      return errorResponse(err, "Настанот не можеше да се зачува.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: createEventBody, invalidBodyError: "Неважечки податоци за настанот." },
);
