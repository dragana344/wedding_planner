import { NextRequest, NextResponse } from "next/server";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const { room_id: roomId } = await request.json();
    const restored = await coupleSeatingActionsFor(eventId).revertToStandard(eventId, roomId);
    return NextResponse.json(restored);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа враќањето на стандардниот распоред." }, { status: 400 });
  }
}
