// app/api/couple/invitation/photo/route.ts
import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { createInvitationPhotoUpload } from "@/lib/couple/invitations";
import { RATE_LIMITS, checkRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";

// SEC-005 step 1: a signed upload for a server-chosen path. The photo itself
// never passes through this function (Vercel's 4.5 MB body limit); the
// browser uploads it straight to Storage, then calls ./confirm.
export const POST = withCoupleEvent(
  async ({ eventId }) => {
    // SEC-002: 20 uploads per hour per event.
    const limit = await checkRateLimit(RATE_LIMITS.invitationPhoto, eventId);
    if (!limit.ok) return rateLimitedResponse(limit);
    return NextResponse.json(await createInvitationPhotoUpload(eventId));
  },
  { feature: "invitation_photo", fallbackError: "Не успеа прикачувањето на фотографијата." },
);
