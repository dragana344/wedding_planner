import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { budgetItemBody, idParams } from "@/lib/api/schemas";
import { updateBudgetItem, deleteBudgetItem } from "@/lib/couple/budget";

export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    const updated = await updateBudgetItem(eventId, params.id, {
      category: body.category,
      custom_label: body.custom_label || null,
      name: body.name,
      estimated_amount: body.estimated_amount ?? null,
      paid_amount: body.paid_amount ?? 0,
    });
    return NextResponse.json(updated);
  },
  { params: idParams, body: budgetItemBody, fallbackError: "Не успеа ажурирањето на ставката." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await deleteBudgetItem(eventId, params.id);
    return NextResponse.json({ ok: true });
  },
  { params: idParams, fallbackError: "Не успеа бришењето на ставката." },
);
