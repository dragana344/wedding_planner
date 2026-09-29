import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { guestsEmailBody } from "@/lib/api/schemas";
import { sendInvitationEmails } from "@/lib/couple/invitation-sending";

// A9: email guests their personal invitation links through Resend. Links
// point at SITE_URL (the public domain) when set, else at this request's origin.
export const POST = withCoupleEvent(
  async ({ request, eventId, body }) => {
    const origin = process.env.SITE_URL || new URL(request.url).origin;
    return NextResponse.json(await sendInvitationEmails(eventId, body.guest_ids, origin));
  },
  { body: guestsEmailBody, fallbackError: "Не успеа праќањето на поканите." },
);
