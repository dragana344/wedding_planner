import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { agendaCreateBody } from "@/lib/api/schemas";
import { listAgendaItems, addAgendaItem } from "@/lib/couple/agenda";

export const GET = withCoupleEvent(
  async ({ eventId }) => NextResponse.json(await listAgendaItems(eventId)),
  { fallbackError: "Не успеа вчитувањето на агендата." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const created = await addAgendaItem(eventId, { time: body.time || null, title: body.title, notes: body.notes || null });
    return NextResponse.json(created);
  },
  { body: agendaCreateBody, fallbackError: "Не успеа додавањето на ставката." },
);
