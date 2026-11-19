import { NextResponse } from "next/server";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { RSVP_NOT_FOUND_ERROR, slugParams } from "@/lib/api/schemas";
import { identifyGreetingSenderByName } from "@/lib/couple/invite-greetings";
import { ALBUM_RATE_LIMITS, GREETING_ERROR, invitationGreetingIdentifyBody } from "@/lib/media/guest-api";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// 0152: the shared link's way to unlock the greeting box before the guest
// has answered the RSVP — their name (plus the browser's remembered token
// and an optional phone), matched with the RSVP's own rules; since 0179
// only a sure match counts, otherwise the guest is asked to answer first
// (400 with that message). Personal links never need this: their token
// already names the guest (see ../route.ts).
export const POST = withPublic(
  async ({ request, params, body }) => {
    const limit = await checkRateLimit(ALBUM_RATE_LIMITS.greetingIdentify, `invite:${params.slug}:${clientIp(request)}`);
    if (!limit.ok) return rateLimitedResponse(limit);
    try {
      const result = await identifyGreetingSenderByName(params.slug, { fullName: body.full_name, phone: body.phone, remember: body.remember });
      if (!result) return NextResponse.json({ error: RSVP_NOT_FOUND_ERROR }, { status: 404 });
      return NextResponse.json(result);
    } catch (err) {
      return errorResponse(err, GREETING_ERROR, request);
    }
  },
  { params: slugParams, invalidParamsError: RSVP_NOT_FOUND_ERROR, body: invitationGreetingIdentifyBody, invalidBodyError: GREETING_ERROR },
);
