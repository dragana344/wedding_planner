import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { menuQuantitiesBody } from "@/lib/api/schemas";
import { getMenuItemQuantities, setMenuItemQuantities } from "@/lib/couple/menu";

export const GET = withCoupleEvent(
  async ({ eventId }) => NextResponse.json(await getMenuItemQuantities(eventId)),
  { fallbackError: "Не успеа вчитувањето на количините." },
);

export const PATCH = withCoupleEvent(
  async ({ eventId, body }) => {
    await setMenuItemQuantities(
      eventId,
      body.quantities.map((q) => ({ menu_item_id: q.menu_item_id, guest_count: q.guest_count ?? null })),
    );
    return NextResponse.json({ ok: true });
  },
  { body: menuQuantitiesBody, fallbackError: "Не успеа зачувувањето на количините." },
);
