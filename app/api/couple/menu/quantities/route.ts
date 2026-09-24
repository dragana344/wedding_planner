import { NextRequest, NextResponse } from "next/server";
import { getMenuItemQuantities, setMenuItemQuantities } from "@/lib/couple/menu";

export async function GET(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    return NextResponse.json(await getMenuItemQuantities(eventId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load quantities." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    await setMenuItemQuantities(eventId, body.quantities);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save quantities." }, { status: 400 });
  }
}
