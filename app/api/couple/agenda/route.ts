import { NextRequest, NextResponse } from "next/server";
import { listAgendaItems, addAgendaItem } from "@/lib/couple/agenda";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    return NextResponse.json(await listAgendaItems(eventId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load agenda." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const created = await addAgendaItem(eventId, { time: body.time || null, title: body.title, notes: body.notes || null });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add item." }, { status: 400 });
  }
}
