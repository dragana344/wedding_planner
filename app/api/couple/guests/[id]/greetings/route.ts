import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { idParams } from "@/lib/api/schemas";
import { listGreetingsForGuest } from "@/lib/couple/guest-greetings";

// A7: the greetings a guest signed, for the couple's guest detail panel.
export const GET = withCoupleEvent(
  async ({ eventId, params }) => NextResponse.json({ greetings: await listGreetingsForGuest(eventId, params.id) }),
  { feature: "guest_greetings", params: idParams, fallbackError: "Не успеа вчитувањето на честитките." },
);
