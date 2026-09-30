import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { roomIdBody } from "@/lib/api/schemas";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const restored = await coupleSeatingActionsFor(eventId).redo!(eventId, body.room_id);
    return NextResponse.json(restored);
  },
  { feature: "seating", body: roomIdBody, fallbackError: "Нема што да се повтори." },
);
