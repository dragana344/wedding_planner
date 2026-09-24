// app/api/couple/checklist/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { updateChecklistItem, toggleChecklistItem, deleteChecklistItem } from "@/lib/couple/checklist";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    if (body.type === "toggle") {
      return NextResponse.json(await toggleChecklistItem(eventId, params.id, body.is_done));
    }
    const updated = await updateChecklistItem(eventId, params.id, { title: body.title, due_date: body.due_date || null });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update task." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    await deleteChecklistItem(eventId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete task." }, { status: 400 });
  }
}
