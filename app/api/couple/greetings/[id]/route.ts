import { NextResponse } from "next/server";
import { z } from "zod";
import { withCoupleEvent } from "@/lib/api/handler";
import { idParams } from "@/lib/api/schemas";
import { deleteGreeting, setGreetingHidden } from "@/lib/media/greetings";

// C2: the couple moderates their guests' greetings. Ids from another event
// match no row, so they change nothing.
export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    await setGreetingHidden(eventId, params.id, body.hidden);
    return NextResponse.json({ ok: true });
  },
  { params: idParams, body: z.object({ hidden: z.boolean() }), fallbackError: "Не успеа промената на честитката." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await deleteGreeting(eventId, params.id);
    return NextResponse.json({ ok: true });
  },
  { params: idParams, fallbackError: "Не успеа бришењето на честитката." },
);
