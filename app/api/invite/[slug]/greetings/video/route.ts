import { NextResponse } from "next/server";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { RSVP_NOT_FOUND_ERROR, slugParams } from "@/lib/api/schemas";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
import { startInvitationGreetingVideo } from "@/lib/couple/invite-greetings";
import { ALBUM_RATE_LIMITS, ALBUM_UPLOAD_ERROR, invitationGreetingVideoBody, lockedResponse } from "@/lib/media/guest-api";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// 0151: a signed upload for the video of a greeting sent from the invitation
// (≤ 500 MB; the package's max_video_seconds, as measured by the browser). The
// greeting itself is posted to ../ with the returned path.
export const POST = withPublic(
  async ({ request, params, body }) => {
    const limit = await checkRateLimit(ALBUM_RATE_LIMITS.videoUpload, `invite:${params.slug}:${clientIp(request)}`);
    if (!limit.ok) return rateLimitedResponse(limit);
    try {
      const sender = body.guest_token ? { guestToken: body.guest_token } : { ticket: body.ticket };
      return NextResponse.json(await startInvitationGreetingVideo(params.slug, sender, { bytes: body.bytes, seconds: body.seconds }));
    } catch (err) {
      if (err instanceof Error && err.message === LOCKED_MESSAGE) return lockedResponse();
      return errorResponse(err, ALBUM_UPLOAD_ERROR, request);
    }
  },
  { params: slugParams, invalidParamsError: RSVP_NOT_FOUND_ERROR, body: invitationGreetingVideoBody, invalidBodyError: ALBUM_UPLOAD_ERROR },
);
