import { NextRequest, NextResponse } from "next/server";
import { updateGuest, updateGuestStatus, updateGuestSide, deleteGuest } from "@/lib/couple/guests";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const body = await request.json();
    if (body.type === "status") {
      return NextResponse.json(await updateGuestStatus(eventId, params.id, body.rsvp_status));
    }
    if (body.type === "side") {
      return NextResponse.json(await updateGuestSide(eventId, params.id, body.side));
    }
    const updated = await updateGuest(eventId, params.id, {
      full_name: body.full_name,
      phone: body.phone || null,
      party_size: body.party_size ?? 1,
      notes: body.notes || null,
      side: body.side || null,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа ажурирањето на гостинот." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    await deleteGuest(eventId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа бришењето на гостинот." }, { status: 400 });
  }
}
