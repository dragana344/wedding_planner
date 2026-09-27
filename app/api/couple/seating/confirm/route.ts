import { NextRequest, NextResponse } from "next/server";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  const roomId = request.nextUrl.searchParams.get("room_id");
  if (!roomId) return NextResponse.json({ error: "room_id е задолжителен." }, { status: 400 });

  try {
    const actions = coupleSeatingActionsFor(eventId);
    const confirmedAt = await actions.getConfirmedAt!(eventId, roomId);
    return NextResponse.json({ confirmedAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа вчитувањето на потврдата." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const { room_id: roomId } = await request.json();
    await coupleSeatingActionsFor(eventId).confirm!(eventId, roomId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа потврдувањето на распоредот." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  const roomId = request.nextUrl.searchParams.get("room_id");
  if (!roomId) return NextResponse.json({ error: "room_id е задолжителен." }, { status: 400 });

  try {
    await coupleSeatingActionsFor(eventId).unconfirm!(eventId, roomId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа поништувањето на потврдата на распоредот." }, { status: 400 });
  }
}
