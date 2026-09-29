import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { roomIdBody } from "@/lib/api/schemas";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const restored = await coupleSeatingActionsFor(eventId).revertToStandard(eventId, body.room_id);
    return NextResponse.json(restored);
  },
  { body: roomIdBody, fallbackError: "Не успеа враќањето на стандардниот распоред." },
);
