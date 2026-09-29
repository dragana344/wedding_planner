import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { parseInput, roomIdQuery, ROOM_ID_REQUIRED_ERROR, seatingElementCreateBody } from "@/lib/api/schemas";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export const GET = withCoupleEvent(
  async ({ eventId, request }) => {
    const room = parseInput(roomIdQuery, request.nextUrl.searchParams.get("room_id"), ROOM_ID_REQUIRED_ERROR);
    if (!room.success) return NextResponse.json({ error: room.error }, { status: 400 });
    const roomId = room.data;

    const actions = coupleSeatingActionsFor(eventId);
    const [fixedElements, layoutElements] = await Promise.all([
      actions.listFixedElements(roomId),
      actions.listLayoutElements(eventId, roomId),
    ]);
    return NextResponse.json({ fixedElements, layoutElements });
  },
  { fallbackError: "Не успеа вчитувањето на распоредот." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    // Only the schema's whitelisted fields are passed on; event_id always
    // comes from the session, never from the client.
    const { room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm, label } = body;
    const created = await coupleSeatingActionsFor(eventId).addElement({
      event_id: eventId,
      room_id,
      element_type,
      table_type_id,
      x_cm,
      y_cm,
      width_cm,
      length_cm,
      label,
    });
    return NextResponse.json(created);
  },
  { body: seatingElementCreateBody, fallbackError: "Не успеа додавањето на елементот." },
);
