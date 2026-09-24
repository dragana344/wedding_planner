// app/api/couple/checklist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listChecklistItems, addChecklistItem, computeChecklistStats } from "@/lib/couple/checklist";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const items = await listChecklistItems(eventId);
    const stats = computeChecklistStats(items);
    return NextResponse.json({ items, stats });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load checklist." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const created = await addChecklistItem(eventId, { title: body.title, due_date: body.due_date || null });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add task." }, { status: 400 });
  }
}
