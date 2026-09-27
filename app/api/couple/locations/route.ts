import { NextRequest, NextResponse } from "next/server";
import { listLocations, addLocation } from "@/lib/couple/locations";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    return NextResponse.json(await listLocations(eventId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа вчитувањето на локациите." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const body = await request.json();
    const created = await addLocation(eventId, { label: body.label, address: body.address || null, map_url: body.map_url || null });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа додавањето на локацијата." }, { status: 400 });
  }
}
