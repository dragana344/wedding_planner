import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { parseInput, roomIdQuery, ROOM_ID_REQUIRED_ERROR } from "@/lib/api/schemas";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

/** Whether undo / redo have a step to take, for the editor's buttons. */
export const GET = withCoupleEvent(
  async ({ eventId, request }) => {
    const room = parseInput(roomIdQuery, request.nextUrl.searchParams.get("room_id"), ROOM_ID_REQUIRED_ERROR);
    if (!room.success) return NextResponse.json({ error: room.error }, { status: 400 });
    return NextResponse.json(await coupleSeatingActionsFor(eventId).getHistoryState!(eventId, room.data));
  },
  { feature: "seating", fallbackError: "Не успеа вчитувањето на историјата." },
);
