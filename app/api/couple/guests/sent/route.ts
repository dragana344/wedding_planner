import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { guestsSentBody } from "@/lib/api/schemas";
import { markInvitationSent } from "@/lib/couple/invitation-sending";
import { organizerSide } from "@/lib/couple/organizer-side";

// A8/A9: the couple opened WhatsApp/Viber/SMS or copied the link for these
// guests. A co-organizer marks only their own side's guests (A12).
export const POST = withCoupleEvent(
  async ({ request, eventId, body }) =>
    NextResponse.json({ guests: await markInvitationSent(eventId, body.guest_ids, body.channel, organizerSide(request)) }),
  { feature: "personal_invite_links", body: guestsSentBody, fallbackError: "Не успеа означувањето на поканите." },
);
