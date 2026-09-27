// app/api/couple/invitation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getInvitation, upsertInvitation } from "@/lib/couple/invitations";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    return NextResponse.json(await getInvitation(eventId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа вчитувањето на поканата." }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const body = await request.json();
    const saved = await upsertInvitation(eventId, { template_id: body.template_id, message: body.message || null });
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа зачувувањето на поканата." }, { status: 400 });
  }
}
