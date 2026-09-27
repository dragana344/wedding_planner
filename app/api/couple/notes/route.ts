// app/api/couple/notes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listNotes, createNote } from "@/lib/couple/notes";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    return NextResponse.json(await listNotes(eventId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа вчитувањето на белешките." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const body = await request.json();
    const created = await createNote(eventId, { title: body.title || null, content: body.content ?? "" });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа создавањето на белешката." }, { status: 400 });
  }
}
