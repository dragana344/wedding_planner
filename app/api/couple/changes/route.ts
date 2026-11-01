import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { loadCoupleMarks } from "@/lib/couple/change-marks";

// What the venue changed that the couple has not pressed "Видено" on, plus
// numbers the venue entered for them.
export const GET = withCoupleEvent(
  async ({ eventId }) => {
    const { unseen, venueNumbersUnseen } = await loadCoupleMarks(eventId);
    return NextResponse.json({ unseen, venueNumbersUnseen });
  },
  { fallbackError: "Не успеа вчитувањето на промените." },
);
