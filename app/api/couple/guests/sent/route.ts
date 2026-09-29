import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { guestsSentBody } from "@/lib/api/schemas";
import { markInvitationSent } from "@/lib/couple/invitation-sending";

// A8/A9: the couple opened WhatsApp/Viber/SMS or copied the link for these guests.
export const POST = withCoupleEvent(
  async ({ eventId, body }) => NextResponse.json({ guests: await markInvitationSent(eventId, body.guest_ids, body.channel) }),
  { body: guestsSentBody, fallbackError: "Не успеа означувањето на поканите." },
);
