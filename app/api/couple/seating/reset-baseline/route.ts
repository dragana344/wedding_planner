import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { roomIdBody } from "@/lib/api/schemas";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

// Project A §3: "Reset to baseline" — copies the event's frozen starting
// layout into the couple's draft.
export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const restored = await coupleSeatingActionsFor(eventId).resetToBaseline!(eventId, body.room_id);
    return NextResponse.json(restored);
  },
  { feature: "seating", body: roomIdBody, fallbackError: "Не успеа враќањето на договорениот распоред." },
);
