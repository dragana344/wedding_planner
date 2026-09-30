// app/api/couple/menu/route.ts
import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { menuSelectionBody } from "@/lib/api/schemas";
import { setEventMenuSelection } from "@/lib/couple/menu";
import { eventHasFeature } from "@/lib/entitlements/server";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";

export const PATCH = withCoupleEvent(
  async ({ eventId, body }) => {
    // An unknown or missing `mode` is rejected by the schema with the route's
    // "Непознат режим на избор." message.
    if (body.mode === "template") {
      await setEventMenuSelection(eventId, { mode: "template", menuTemplateId: body.menu_template_id });
    } else {
      if (!(await eventHasFeature(eventId, "custom_menu"))) {
        return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 403 });
      }
      await setEventMenuSelection(eventId, { mode: "custom", menuItemIds: body.menu_item_ids ?? [] });
    }
    return NextResponse.json({ ok: true });
  },
  { invalidJsonError: "Неважечко JSON тело", body: menuSelectionBody, fallbackError: "Не успеа зачувувањето на избраното мени." },
);
