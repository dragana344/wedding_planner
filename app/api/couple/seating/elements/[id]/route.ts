import { NextRequest, NextResponse } from "next/server";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const body = await request.json();
    const actions = coupleSeatingActionsFor(eventId);
    if (body.type === "position") {
      return NextResponse.json(await actions.moveElement(params.id, body.x_cm, body.y_cm));
    }
    if (body.type === "size") {
      return NextResponse.json(await actions.resizeElement(params.id, body.width_cm, body.length_cm));
    }
    if (body.type === "rotation") {
      return NextResponse.json(await actions.rotateElement(params.id, body.rotation_deg));
    }
    return NextResponse.json({ error: "Непознат тип на ажурирање." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа ажурирањето на елементот." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    await coupleSeatingActionsFor(eventId).deleteElement(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа бришењето на елементот." }, { status: 400 });
  }
}
