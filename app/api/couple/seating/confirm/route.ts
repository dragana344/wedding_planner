import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { parseInput, roomIdBody, roomIdQuery, ROOM_ID_REQUIRED_ERROR } from "@/lib/api/schemas";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export const GET = withCoupleEvent(
  async ({ eventId, request }) => {
    const room = parseInput(roomIdQuery, request.nextUrl.searchParams.get("room_id"), ROOM_ID_REQUIRED_ERROR);
    if (!room.success) return NextResponse.json({ error: room.error }, { status: 400 });
    const roomId = room.data;

    const actions = coupleSeatingActionsFor(eventId);
    const confirmedAt = await actions.getConfirmedAt!(eventId, roomId);
    return NextResponse.json({ confirmedAt });
  },
  { fallbackError: "Не успеа вчитувањето на потврдата." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    await coupleSeatingActionsFor(eventId).confirm!(eventId, body.room_id);
    return NextResponse.json({ ok: true });
  },
  { body: roomIdBody, fallbackError: "Не успеа потврдувањето на распоредот." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, request }) => {
    const room = parseInput(roomIdQuery, request.nextUrl.searchParams.get("room_id"), ROOM_ID_REQUIRED_ERROR);
    if (!room.success) return NextResponse.json({ error: room.error }, { status: 400 });
    const roomId = room.data;

    await coupleSeatingActionsFor(eventId).unconfirm!(eventId, roomId);
    return NextResponse.json({ ok: true });
  },
  { fallbackError: "Не успеа поништувањето на потврдата на распоредот." },
);
