import { NextRequest, NextResponse } from "next/server";
import { updateAgendaItem, deleteAgendaItem, moveAgendaItem } from "@/lib/couple/agenda";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    if (body.type === "move") {
      return NextResponse.json(await moveAgendaItem(eventId, params.id, body.direction));
    }
    const updated = await updateAgendaItem(eventId, params.id, {
      time: body.time || null,
      title: body.title,
      notes: body.notes || null,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update item." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    await deleteAgendaItem(eventId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete item." }, { status: 400 });
  }
}
