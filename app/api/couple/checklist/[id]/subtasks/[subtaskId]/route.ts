import { NextRequest, NextResponse } from "next/server";
import { toggleSubtask, deleteSubtask } from "@/lib/couple/checklist";

export async function PATCH(request: NextRequest, { params }: { params: { id: string; subtaskId: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const updated = await toggleSubtask(eventId, params.id, params.subtaskId, body.is_done);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update subtask." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; subtaskId: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    await deleteSubtask(eventId, params.id, params.subtaskId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete subtask." }, { status: 400 });
  }
}
