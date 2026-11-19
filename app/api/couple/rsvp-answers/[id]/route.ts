import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { answerResolveBody, idParams } from "@/lib/api/schemas";
import { AnswerConflictError, resolveAnswer } from "@/lib/couple/rsvp-answers";
import { organizerSide } from "@/lib/couple/organizer-side";
import { coupleChangerName } from "@/lib/changes/server";
import { noteNumbersChange } from "@/lib/couple/numbers-changes";

// 0179 "Да се провери": the couple says whose a pending shared-link answer
// is (a listed guest or a new one), or ignores it. Open to co-organizers
// too, like recording a guest's status. A guest with a newer answer gets a
// 409 with `conflict` (0184) until the couple says apply or link.
export const POST = withCoupleEvent(
  async ({ request, eventId, params, body }) => {
    const resolution =
      body.action === "guest" ? { kind: "guest" as const, guestId: body.guest_id, mode: body.mode } : { kind: body.action };
    let guest;
    try {
      guest = await resolveAnswer(eventId, params.id, resolution, organizerSide(request) ?? "couple");
    } catch (err) {
      // 0184: the guest has a newer answer — the couple picks "Примени го сепак" or "Само поврзи".
      if (err instanceof AnswerConflictError) return NextResponse.json({ error: err.message, conflict: { newer_at: err.newerAt } }, { status: 409 });
      throw err;
    }
    if (guest) await noteNumbersChange(eventId, coupleChangerName(organizerSide(request)));
    return NextResponse.json({ ok: true, guest });
  },
  { params: idParams, body: answerResolveBody, fallbackError: "Не успеа решавањето на одговорот." },
);
