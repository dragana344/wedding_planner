// app/api/couple/checklist/[id]/route.ts
import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { checklistUpdateBody, idParams } from "@/lib/api/schemas";
import { updateChecklistItem, toggleChecklistItem, deleteChecklistItem } from "@/lib/couple/checklist";

export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    if (body.type === "toggle") {
      return NextResponse.json(await toggleChecklistItem(eventId, params.id, body.is_done));
    }
    const updated = await updateChecklistItem(eventId, params.id, { title: body.title, due_date: body.due_date || null });
    return NextResponse.json(updated);
  },
  { feature: "checklist", params: idParams, body: checklistUpdateBody, fallbackError: "Не успеа ажурирањето на задачата." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await deleteChecklistItem(eventId, params.id);
    return NextResponse.json({ ok: true });
  },
  { feature: "checklist", params: idParams, fallbackError: "Не успеа бришењето на задачата." },
);
