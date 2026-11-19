import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { listAnswers } from "@/lib/couple/rsvp-answers";

// 0179: the guests' answers, newest first, for the "Одговори" inbox on the
// guest list (pending ones carry their likely guests).
export const GET = withCoupleEvent(
  async ({ eventId }) => {
    const answers = await listAnswers(eventId);
    return NextResponse.json({ answers, pending: answers.filter((a) => a.reviewState === "pending").length });
  },
  { fallbackError: "Не успеа вчитувањето на одговорите." },
);
