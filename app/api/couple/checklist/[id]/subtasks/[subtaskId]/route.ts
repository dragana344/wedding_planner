import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { subtaskParams, subtaskUpdateBody } from "@/lib/api/schemas";
import { toggleSubtask, deleteSubtask } from "@/lib/couple/checklist";

export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    const updated = await toggleSubtask(eventId, params.id, params.subtaskId, body.is_done);
    return NextResponse.json(updated);
  },
  { params: subtaskParams, body: subtaskUpdateBody, fallbackError: "Не успеа ажурирањето на подзадачата." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await deleteSubtask(eventId, params.id, params.subtaskId);
    return NextResponse.json({ ok: true });
  },
  { params: subtaskParams, fallbackError: "Не успеа бришењето на подзадачата." },
);
