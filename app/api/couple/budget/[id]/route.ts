import { NextRequest, NextResponse } from "next/server";
import { updateBudgetItem, deleteBudgetItem } from "@/lib/couple/budget";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const updated = await updateBudgetItem(eventId, params.id, {
      category: body.category,
      custom_label: body.custom_label || null,
      name: body.name,
      estimated_amount: body.estimated_amount ?? null,
      paid_amount: body.paid_amount ?? 0,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update item." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    await deleteBudgetItem(eventId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete item." }, { status: 400 });
  }
}
