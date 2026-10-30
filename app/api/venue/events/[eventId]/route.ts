import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { updateEvent, deleteEvent, EventNotFoundError, PastEventError } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, updateEventBody, uuid } from "@/lib/api/schemas";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const paramsSchema = z.object({ eventId: uuid });

export const PATCH = withPublic(
  async ({ request, params, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    try {
      // The elevation check above is the real authorization now; RLS limits
      // the signed-in staff session's own writes to a few unguarded columns
      // (migration 0096), so the actual write uses the service-role client.
      await updateEvent(params.eventId, venueId, body, createServiceRoleClient());
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof EventNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
      // Security review fix: past events are read-only, server-side.
      if (err instanceof PastEventError) return NextResponse.json({ error: err.message }, { status: 409 });
      return errorResponse(err, "Настанот не можеше да се зачува.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: updateEventBody, params: paramsSchema, invalidBodyError: "Неважечки податоци за настанот." },
);

export const DELETE = withPublic(
  async ({ request, params }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    try {
      // The elevation check above is the real authorization now; RLS limits
      // the signed-in staff session's own writes to a few unguarded columns
      // (migration 0096), so the actual write uses the service-role client
      // — which bypasses RLS entirely, so venueId must be checked explicitly
      // here instead of relying on is_venue_staff_for to scope the delete.
      await deleteEvent(params.eventId, venueId, createServiceRoleClient());
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof EventNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
      return errorResponse(err, "Настанот не можеше да се избрише.", request);
    }
  },
  { params: paramsSchema },
);
