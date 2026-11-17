import { NextResponse } from "next/server";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { RSVP_NOT_FOUND_ERROR, slugParams } from "@/lib/api/schemas";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
import { sendInvitationGreeting } from "@/lib/couple/invite-greetings";
import { ALBUM_RATE_LIMITS, GREETING_ERROR, invitationGreetingBody, lockedResponse } from "@/lib/media/guest-api";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// 0151: a guest's greeting from the invitation, after their RSVP. The guest is
// named by their personal link's token or by the ticket the RSVP returned;
// the video, if any, was uploaded through ./video.
export const POST = withPublic(
  async ({ request, params, body }) => {
    const limit = await checkRateLimit(ALBUM_RATE_LIMITS.greeting, `invite:${params.slug}:${clientIp(request)}`);
    if (!limit.ok) return rateLimitedResponse(limit);
    try {
      const sender = body.guest_token ? { guestToken: body.guest_token } : { ticket: body.ticket };
      return NextResponse.json(await sendInvitationGreeting(params.slug, sender, { message: body.message, videoPath: body.video_path }));
    } catch (err) {
      if (err instanceof Error && err.message === LOCKED_MESSAGE) return lockedResponse();
      return errorResponse(err, GREETING_ERROR, request);
    }
  },
  { params: slugParams, invalidParamsError: RSVP_NOT_FOUND_ERROR, body: invitationGreetingBody, invalidBodyError: GREETING_ERROR },
);
