import { NextResponse } from "next/server";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { RSVP_NOT_FOUND_ERROR, slugParams } from "@/lib/api/schemas";
import { identifyGreetingSenderByName } from "@/lib/couple/invite-greetings";
import { ALBUM_RATE_LIMITS, GREETING_ERROR, invitationGreetingIdentifyBody } from "@/lib/media/guest-api";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// 0152: the shared link's way to unlock the greeting box before the guest
// has answered the RSVP — just their name, matched the same way the real
// RSVP matches a name, so answering for real afterwards lands on the same
// guest row. Personal links never need this: their token already names the
// guest (see ../route.ts).
export const POST = withPublic(
  async ({ request, params, body }) => {
    const limit = await checkRateLimit(ALBUM_RATE_LIMITS.greetingIdentify, `invite:${params.slug}:${clientIp(request)}`);
    if (!limit.ok) return rateLimitedResponse(limit);
    try {
      const result = await identifyGreetingSenderByName(params.slug, body.full_name);
      if (!result) return NextResponse.json({ error: RSVP_NOT_FOUND_ERROR }, { status: 404 });
      return NextResponse.json(result);
    } catch (err) {
      return errorResponse(err, GREETING_ERROR, request);
    }
  },
  { params: slugParams, invalidParamsError: RSVP_NOT_FOUND_ERROR, body: invitationGreetingIdentifyBody, invalidBodyError: GREETING_ERROR },
);
