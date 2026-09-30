// app/api/couple/checklist/route.ts
import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { checklistCreateBody } from "@/lib/api/schemas";
import { listChecklistItems, addChecklistItem, computeChecklistStats } from "@/lib/couple/checklist";

export const GET = withCoupleEvent(
  async ({ eventId }) => {
    const items = await listChecklistItems(eventId);
    const stats = computeChecklistStats(items);
    return NextResponse.json({ items, stats });
  },
  { feature: "checklist", fallbackError: "Не успеа вчитувањето на чеклистата." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const created = await addChecklistItem(eventId, { title: body.title, due_date: body.due_date || null });
    return NextResponse.json(created);
  },
  { feature: "checklist", body: checklistCreateBody, fallbackError: "Не успеа додавањето на задачата." },
);
