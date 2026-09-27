// app/api/couple/menu/route.ts
import { NextRequest, NextResponse } from "next/server";
import { setEventMenuSelection } from "@/lib/couple/menu";

export async function PATCH(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });

  let body: { mode?: string; menu_template_id: string; menu_item_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неважечко JSON тело" }, { status: 400 });
  }

  try {
    if (body.mode === "template") {
      await setEventMenuSelection(eventId, { mode: "template", menuTemplateId: body.menu_template_id });
    } else if (body.mode === "custom") {
      await setEventMenuSelection(eventId, { mode: "custom", menuItemIds: body.menu_item_ids ?? [] });
    } else {
      return NextResponse.json({ error: "Непознат режим на избор." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Не успеа зачувувањето на избраното мени." }, { status: 400 });
  }
}
