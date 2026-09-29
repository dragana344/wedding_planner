import { NextResponse } from "next/server";
import { ALBUM_RATE_LIMITS, GREETING_ERROR, greetingBody, withGuestAlbum } from "@/lib/media/guest-api";
import { createGreeting } from "@/lib/media/greetings";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// C2: a guest's greeting, with first and last name, and optionally the video
// uploaded through ./video.
export const POST = withGuestAlbum(
  async ({ request, params, body, album }) => {
    const limit = await checkRateLimit(ALBUM_RATE_LIMITS.greeting, `${params.token}:${clientIp(request)}`);
    if (!limit.ok) return rateLimitedResponse(limit);
    return NextResponse.json(
      await createGreeting(album.eventId, {
        firstName: body.first_name,
        lastName: body.last_name,
        message: body.message,
        videoPath: body.video_path,
      }),
    );
  },
  { body: greetingBody, fallbackError: GREETING_ERROR },
);
