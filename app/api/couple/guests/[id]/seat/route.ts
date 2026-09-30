import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { idParams } from "@/lib/api/schemas";
import { getGuestSeat } from "@/lib/couple/guests";

// A7: the guest's table and seat for the detail panel (null until seated).
export const GET = withCoupleEvent(
  async ({ eventId, params }) => NextResponse.json({ seat: await getGuestSeat(eventId, params.id) }),
  { feature: "seating", params: idParams, fallbackError: "Не успеа вчитувањето на местото." },
);
