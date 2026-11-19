import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { coupleAnswerBody, idParams } from "@/lib/api/schemas";
import { listGuestAnswerHistory, recordCoupleAnswer } from "@/lib/couple/rsvp-answers";
import { organizerSide } from "@/lib/couple/organizer-side";
import { coupleChangerName } from "@/lib/changes/server";
import { noteNumbersChange } from "@/lib/couple/numbers-changes";

// 0179: a guest's answer history (before → after), and the couple typing in
// an answer the guest gave them by phone (decision 7) — open to
// co-organizers too, like recording a guest's status.
export const GET = withCoupleEvent(
  async ({ eventId, params }) => NextResponse.json({ history: await listGuestAnswerHistory(eventId, params.id) }),
  { params: idParams, fallbackError: "Не успеа вчитувањето на историјата." },
);

export const POST = withCoupleEvent(
  async ({ request, eventId, params, body }) => {
    const guest = await recordCoupleAnswer(
      eventId,
      params.id,
      {
        status: body.status,
        partySize: body.party_size ?? 1,
        childrenCount: body.children_count,
        menuCounts: body.menu_counts,
        noMealCount: body.no_meal_count,
        allergies: body.allergies,
        comment: body.comment,
        householdNames: body.household_names,
      },
      organizerSide(request) ?? "couple",
    );
    await noteNumbersChange(eventId, coupleChangerName(organizerSide(request)));
    return NextResponse.json(guest);
  },
  { params: idParams, body: coupleAnswerBody, fallbackError: "Не успеа зачувувањето на одговорот." },
);
