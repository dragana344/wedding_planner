import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { organizerSide } from "@/lib/couple/organizer-side";
import { changedSince, currentMenuNumbers, listMenuSubmissions, sendMenuNumbers } from "@/lib/couple/menu-submissions";

export const CO_ORGANIZER_SEND_ERROR = "Само главната најава на младенците може да ги испрати бројките.";

export const GET = withCoupleEvent(
  async ({ eventId }) => {
    const [{ numbers, notDone }, [latest = null]] = await Promise.all([currentMenuNumbers(eventId), listMenuSubmissions(eventId, 1)]);
    return NextResponse.json({ current: numbers, notDone, latest, changedSinceLatest: changedSince(latest, numbers) });
  },
  { fallbackError: "Не успеа вчитувањето на бројките." },
);

export const POST = withCoupleEvent(
  async ({ request, eventId }) => {
    if (organizerSide(request) !== null) return NextResponse.json({ error: CO_ORGANIZER_SEND_ERROR }, { status: 403 });
    return NextResponse.json(await sendMenuNumbers(eventId));
  },
  { fallbackError: "Не успеа испраќањето на бројките." },
);
