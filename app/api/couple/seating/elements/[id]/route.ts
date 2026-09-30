import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { idParams, seatingElementUpdateBody } from "@/lib/api/schemas";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    const actions = coupleSeatingActionsFor(eventId);
    if (body.type === "position") {
      return NextResponse.json(await actions.moveElement(params.id, body.x_cm, body.y_cm));
    }
    if (body.type === "size") {
      return NextResponse.json(await actions.resizeElement(params.id, body.width_cm, body.length_cm));
    }
    // Any other `type` is rejected by the schema ("Непознат тип на ажурирање.").
    return NextResponse.json(await actions.rotateElement(params.id, body.rotation_deg));
  },
  { feature: "seating", params: idParams, body: seatingElementUpdateBody, fallbackError: "Не успеа ажурирањето на елементот." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await coupleSeatingActionsFor(eventId).deleteElement(params.id);
    return NextResponse.json({ ok: true });
  },
  { feature: "seating", params: idParams, fallbackError: "Не успеа бришењето на елементот." },
);
