import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { createEventWithCustomMenu } from "@/lib/venue/event-custom-menu";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, createEventBody } from "@/lib/api/schemas";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const NO_DISHES_ERROR = "Изберете барем едно јадење.";

export const POST = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    const { custom_menu: customMenu, ...input } = body;
    if (customMenu) {
      // A new event has no event-level overrides yet: the venue's plan decides.
      if (!(await getVenueFeatures(venueId)).custom_menu.enabled) {
        return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 403 });
      }
      if (customMenu.item_ids.length === 0) return NextResponse.json({ error: NO_DISHES_ERROR }, { status: 400 });
    }
    try {
      // The elevation check above is the real authorization now; RLS limits
      // the signed-in staff session's own writes to a few unguarded columns
      // (migration 0096), so the actual write uses the service-role client.
      const event = await createEventWithCustomMenu(
        createServiceRoleClient(),
        { ...input, venue_id: venueId },
        customMenu ? { name: customMenu.name, itemIds: customMenu.item_ids } : null,
      );
      return NextResponse.json(event);
    } catch (err) {
      return errorResponse(err, "Настанот не можеше да се зачува.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: createEventBody, invalidBodyError: "Неважечки податоци за настанот." },
);

// Whether the venue's plan includes the custom menu, so the new-event form
// can show the locked hint instead of a menu its create would refuse.
export const GET = withPublic(
  async ({ request }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    if (!(await requireManagerElevation(request, venueId))) {
      return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    }
    return NextResponse.json({ customMenuEnabled: (await getVenueFeatures(venueId)).custom_menu.enabled });
  },
  { fallbackError: "Податоците не можеа да се вчитаат." },
);
