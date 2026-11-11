import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { seatMoveBody } from "@/lib/api/schemas";
import { getRoomSeating, moveEventSeat, seatConflictMessage } from "@/lib/seating/seats";

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    try {
      await moveEventSeat(
        eventId,
        body.room_id,
        body.guest_id,
        { elementId: body.to_element_id, seatNumber: body.to_seat_number },
        body.from_element_id && body.from_seat_number
          ? { elementId: body.from_element_id, seatNumber: body.from_seat_number }
          : undefined,
      );
    } catch (err) {
      const message = seatConflictMessage(err);
      if (message) return NextResponse.json({ error: message }, { status: 409 });
      throw err;
    }
    return NextResponse.json(await getRoomSeating(eventId, body.room_id));
  },
  { feature: "seating", body: seatMoveBody, fallbackError: "Не успеа преместувањето на гостинот." },
);
