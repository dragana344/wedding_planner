import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { removeManager } from "@/lib/venue/managers";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";
import { logSecurityEvent } from "@/lib/log";

const OWNER_REQUIRED_ERROR = "Потребна е најава како сопственик.";
const paramsSchema = z.object({ managerId: uuid });

export const DELETE = withPublic(
  async ({ request, params }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const owner = await requireOwnerElevation(request, venueId);
    if (!owner) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });
    try {
      await removeManager(venueId, params.managerId);
      logSecurityEvent("manager_removed", { venue_id: venueId, manager_id: params.managerId, removed_by: owner.managerId });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Менаџерот не можеше да се отстрани.", request);
    }
  },
  { params: paramsSchema },
);
