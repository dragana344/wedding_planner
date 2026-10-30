import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, uuid } from "@/lib/api/schemas";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
import { eventHasFeature } from "@/lib/entitlements/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { saveEventCustomMenu } from "@/lib/venue/event-custom-menu";
import { requireManagerForEvent } from "@/lib/venue/event-guard";
import { assertEventNotPast, PastEventError } from "@/lib/venue/events";

const NO_DISHES_ERROR = "Изберете барем едно јадење.";

// Whether the event's plan includes the custom menu, so the edit form can
// show the locked hint instead of a button whose save would be refused.
export const GET = withPublic(
  async ({ request, params }) => {
    const guard = await requireManagerForEvent(request, params.eventId);
    if (guard instanceof NextResponse) return guard;
    return NextResponse.json({ enabled: await eventHasFeature(params.eventId, "custom_menu") });
  },
  { params: z.object({ eventId: uuid }), fallbackError: "Податоците не можеа да се вчитаат." },
);

// The event's own menu, built by a manager (plan feature "custom_menu").
export const PUT = withPublic(
  async ({ request, params, body }) => {
    const guard = await requireManagerForEvent(request, params.eventId);
    if (guard instanceof NextResponse) return guard;
    if (!(await eventHasFeature(params.eventId, "custom_menu"))) {
      return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 403 });
    }
    const client = createServiceRoleClient();
    try {
      await assertEventNotPast(params.eventId, guard.venueId, client);
    } catch (err) {
      if (err instanceof PastEventError) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }
    if (body.item_ids.length === 0) {
      return NextResponse.json({ error: NO_DISHES_ERROR }, { status: 400 });
    }
    const saved = await saveEventCustomMenu(client, guard.venueId, params.eventId, {
      name: body.name,
      itemIds: body.item_ids,
    });
    return NextResponse.json(saved);
  },
  {
    params: z.object({ eventId: uuid }),
    invalidJsonError: INVALID_JSON_ERROR,
    body: z.object({ name: z.string().trim().min(1).max(200), item_ids: z.array(uuid).max(200) }),
    fallbackError: "Не успеа зачувувањето на менито.",
  },
);
