import { NextRequest, NextResponse } from "next/server";
import { getBudgetSummary, addBudgetItem } from "@/lib/couple/budget";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    return NextResponse.json(await getBudgetSummary(eventId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа вчитувањето на буџетот." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const body = await request.json();
    const created = await addBudgetItem(eventId, {
      category: body.category,
      custom_label: body.custom_label || null,
      name: body.name,
      estimated_amount: body.estimated_amount ?? null,
      paid_amount: body.paid_amount ?? 0,
    });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа додавањето на ставката." }, { status: 400 });
  }
}
