// app/api/couple/notes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { updateNote, deleteNote } from "@/lib/couple/notes";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const updated = await updateNote(eventId, params.id, { title: body.title || null, content: body.content ?? "" });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save note." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    await deleteNote(eventId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete note." }, { status: 400 });
  }
}
