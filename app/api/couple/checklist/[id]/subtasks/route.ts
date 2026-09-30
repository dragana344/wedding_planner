import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { idParams, subtaskCreateBody } from "@/lib/api/schemas";
import { addSubtask } from "@/lib/couple/checklist";

export const POST = withCoupleEvent(
  async ({ eventId, params, body }) => {
    const created = await addSubtask(eventId, params.id, body.title);
    return NextResponse.json(created);
  },
  { feature: "checklist", params: idParams, body: subtaskCreateBody, fallbackError: "Не успеа додавањето на подзадачата." },
);
