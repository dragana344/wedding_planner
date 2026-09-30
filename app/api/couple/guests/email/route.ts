import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { guestsEmailBody } from "@/lib/api/schemas";
import { sendInvitationEmails } from "@/lib/couple/invitation-sending";
import { organizerSide } from "@/lib/couple/organizer-side";
import { resolveOrigin } from "@/lib/origin";

// A9: email guests their personal invitation links through Resend. Links
// point at NEXT_PUBLIC_SITE_URL (the public domain, shared with the QR
// codes) when set, else at this request's Host (lib/origin.ts).
export const POST = withCoupleEvent(
  async ({ request, eventId, body }) => {
    const origin = resolveOrigin((name) => request.headers.get(name), process.env.NEXT_PUBLIC_SITE_URL);
    // A co-organizer emails only their own side's guests (A12).
    return NextResponse.json(await sendInvitationEmails(eventId, body.guest_ids, origin, organizerSide(request)));
  },
  { feature: "personal_invite_links", body: guestsEmailBody, fallbackError: "Не успеа праќањето на поканите." },
);
