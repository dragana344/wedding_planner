import { NextRequest, NextResponse } from "next/server";
import { listGuests, addGuest, getGuestStats } from "@/lib/couple/guests";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [guests, stats] = await Promise.all([listGuests(eventId), getGuestStats(eventId)]);
    return NextResponse.json({ guests, stats });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load guests." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const created = await addGuest(eventId, {
      full_name: body.full_name,
      phone: body.phone || null,
      party_size: body.party_size ?? 1,
      notes: body.notes || null,
      side: body.side || null,
    });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add guest." }, { status: 400 });
  }
}
