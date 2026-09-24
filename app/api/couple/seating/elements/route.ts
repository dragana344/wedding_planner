import { NextRequest, NextResponse } from "next/server";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const roomId = request.nextUrl.searchParams.get("room_id");
  if (!roomId) return NextResponse.json({ error: "room_id is required." }, { status: 400 });

  try {
    const actions = coupleSeatingActionsFor(eventId);
    const [fixedElements, layoutElements] = await Promise.all([
      actions.listFixedElements(roomId),
      actions.listLayoutElements(eventId, roomId),
    ]);
    return NextResponse.json({ fixedElements, layoutElements });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load seating." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const created = await coupleSeatingActionsFor(eventId).addElement({ ...body, event_id: eventId });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add element." }, { status: 400 });
  }
}
