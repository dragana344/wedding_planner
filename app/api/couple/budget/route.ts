import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { budgetItemBody } from "@/lib/api/schemas";
import { getBudgetSummary, addBudgetItem } from "@/lib/couple/budget";

export const GET = withCoupleEvent(
  async ({ eventId }) => NextResponse.json(await getBudgetSummary(eventId)),
  { fallbackError: "Не успеа вчитувањето на буџетот." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const created = await addBudgetItem(eventId, {
      category: body.category,
      custom_label: body.custom_label || null,
      name: body.name,
      estimated_amount: body.estimated_amount ?? null,
      paid_amount: body.paid_amount ?? 0,
    });
    return NextResponse.json(created);
  },
  { body: budgetItemBody, fallbackError: "Не успеа додавањето на ставката." },
);
