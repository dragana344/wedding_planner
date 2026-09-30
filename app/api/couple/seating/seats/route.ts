import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { parseInput, roomIdQuery, ROOM_ID_REQUIRED_ERROR, seatsPutBody } from "@/lib/api/schemas";
import { getRoomSeating, replaceTableSeats, seatConflictMessage } from "@/lib/seating/seats";

export const GET = withCoupleEvent(
  async ({ eventId, request }) => {
    const room = parseInput(roomIdQuery, request.nextUrl.searchParams.get("room_id"), ROOM_ID_REQUIRED_ERROR);
    if (!room.success) return NextResponse.json({ error: room.error }, { status: 400 });
    return NextResponse.json(await getRoomSeating(eventId, room.data));
  },
  { feature: "seating", fallbackError: "Не успеа вчитувањето на листите по маса." },
);

export const PUT = withCoupleEvent(
  async ({ eventId, body }) => {
    try {
      await replaceTableSeats(
        eventId,
        body.room_id,
        body.layout_element_id,
        body.seats.map((s) => ({ seatNumber: s.seat_number, guestId: s.guest_id, guestName: s.guest_name })),
        {
          recordHistory: true,
          expected: body.expected?.map((s) => ({ seatNumber: s.seat_number, guestId: s.guest_id, guestName: s.guest_name })),
        },
      );
    } catch (err) {
      const message = seatConflictMessage(err);
      if (message) return NextResponse.json({ error: message }, { status: 409 });
      throw err;
    }
    return NextResponse.json(await getRoomSeating(eventId, body.room_id));
  },
  { feature: "seating", body: seatsPutBody, fallbackError: "Не успеа зачувувањето на листата." },
);
