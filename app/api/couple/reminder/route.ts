import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { reminderBody } from "@/lib/api/schemas";
import { getReminder, setReminder } from "@/lib/couple/reminders";

// A10: the guests' reminder email (default 15 days before at 10:00).
export const GET = withCoupleEvent(async ({ eventId }) => NextResponse.json(await getReminder(eventId)), {
  feature: "reminders",
  fallbackError: "Не успеа вчитувањето на потсетникот.",
});

export const PATCH = withCoupleEvent(
  async ({ eventId, body }) => NextResponse.json(await setReminder(eventId, { sendAt: body.send_at, enabled: body.enabled })),
  { feature: "reminders", body: reminderBody, fallbackError: "Не успеа зачувувањето на потсетникот." },
);
