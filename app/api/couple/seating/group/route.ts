import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { groupDeleteQuery, INVALID_INPUT_ERROR, parseInput, seatingGroupBody } from "@/lib/api/schemas";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const elements = await coupleSeatingActionsFor(eventId).group!(eventId, body.room_id, body.element_ids);
    return NextResponse.json(elements);
  },
  { feature: "seating", body: seatingGroupBody, fallbackError: "Не успеа групирањето на масите." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, request }) => {
    const q = parseInput(
      groupDeleteQuery,
      { room_id: request.nextUrl.searchParams.get("room_id"), group_id: request.nextUrl.searchParams.get("group_id") },
      INVALID_INPUT_ERROR,
    );
    if (!q.success) return NextResponse.json({ error: q.error }, { status: 400 });
    const elements = await coupleSeatingActionsFor(eventId).ungroup!(eventId, q.data.room_id, q.data.group_id);
    return NextResponse.json(elements);
  },
  { feature: "seating", fallbackError: "Не успеа разгрупирањето." },
);
