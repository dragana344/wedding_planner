// app/api/couple/invitation/photo/route.ts
import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { uploadInvitationPhoto } from "@/lib/couple/invitations";
import { RATE_LIMITS, checkRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";

// Multipart upload: the handler reads form data itself, inside the wrapper's
// error boundary (no JSON parsing).
export const POST = withCoupleEvent(
  async ({ eventId, request }) => {
    // SEC-002: 20 uploads per hour per event.
    const limit = await checkRateLimit(RATE_LIMITS.invitationPhoto, eventId);
    if (!limit.ok) return rateLimitedResponse(limit);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Не е доставена датотека." }, { status: 400 });
    const path = await uploadInvitationPhoto(eventId, file);
    return NextResponse.json({ photo_path: path });
  },
  { fallbackError: "Не успеа прикачувањето на фотографијата." },
);
