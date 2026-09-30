import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { agendaUpdateBody, idParams } from "@/lib/api/schemas";
import { updateAgendaItem, deleteAgendaItem, moveAgendaItem } from "@/lib/couple/agenda";

export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    if (body.type === "move") {
      return NextResponse.json(await moveAgendaItem(eventId, params.id, body.direction));
    }
    const updated = await updateAgendaItem(eventId, params.id, {
      time: body.time || null,
      title: body.title,
      notes: body.notes || null,
    });
    return NextResponse.json(updated);
  },
  { feature: "agenda", params: idParams, body: agendaUpdateBody, fallbackError: "Не успеа ажурирањето на ставката." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await deleteAgendaItem(eventId, params.id);
    return NextResponse.json({ ok: true });
  },
  { feature: "agenda", params: idParams, fallbackError: "Не успеа бришењето на ставката." },
);
