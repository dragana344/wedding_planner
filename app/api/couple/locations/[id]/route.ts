import { NextRequest, NextResponse } from "next/server";
import { updateLocation, deleteLocation } from "@/lib/couple/locations";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const body = await request.json();
    const updated = await updateLocation(eventId, params.id, {
      label: body.label,
      address: body.address || null,
      map_url: body.map_url || null,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа ажурирањето на локацијата." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    await deleteLocation(eventId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа бришењето на локацијата." }, { status: 400 });
  }
}
