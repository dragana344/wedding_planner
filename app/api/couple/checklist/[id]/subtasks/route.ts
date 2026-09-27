import { NextRequest, NextResponse } from "next/server";
import { addSubtask } from "@/lib/couple/checklist";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });
  try {
    const body = await request.json();
    const created = await addSubtask(eventId, params.id, body.title);
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа додавањето на подзадачата." }, { status: 400 });
  }
}
