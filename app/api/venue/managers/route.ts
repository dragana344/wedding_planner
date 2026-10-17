import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listManagers, addManager } from "@/lib/venue/managers";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, addManagerBody } from "@/lib/api/schemas";
import { logSecurityEvent } from "@/lib/log";

const OWNER_REQUIRED_ERROR = "Потребна е најава како сопственик.";

export const GET = withPublic(async ({ request }) => {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
  const owner = await requireOwnerElevation(request, venueId);
  if (!owner) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });
  const managers = await listManagers(venueId);
  return NextResponse.json({ managers });
});

export const POST = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const owner = await requireOwnerElevation(request, venueId);
    if (!owner) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });
    try {
      const manager = await addManager(venueId, body.name, body.password);
      logSecurityEvent("manager_added", { venue_id: venueId, manager_id: manager.id, added_by: owner.managerId });
      return NextResponse.json(manager);
    } catch (err) {
      return errorResponse(err, "Менаџерот не можеше да се додаде.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: addManagerBody, invalidBodyError: "Внесете име и лозинка (најмалку 8 знаци)." },
);
