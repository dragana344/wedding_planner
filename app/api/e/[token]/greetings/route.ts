import { NextResponse } from "next/server";
import { ALBUM_RATE_LIMITS, GREETING_ERROR, greetingBody, lockedResponse, withGuestAlbum } from "@/lib/media/guest-api";
import { eventHasFeature } from "@/lib/entitlements/server";
import { createGreeting } from "@/lib/media/greetings";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// C2: a guest's greeting, with first and last name, and optionally the video
// uploaded through ./video.
export const POST = withGuestAlbum(
  async ({ request, params, body, album }) => {
    const limit = await checkRateLimit(ALBUM_RATE_LIMITS.greeting, `${params.token}:${clientIp(request)}`);
    if (!limit.ok) return rateLimitedResponse(limit);
    // A greeting carrying a video also needs the video_greetings feature.
    if (body.video_path && !(await eventHasFeature(album.eventId, "video_greetings"))) return lockedResponse();
    return NextResponse.json(
      await createGreeting(album.eventId, {
        firstName: body.first_name,
        lastName: body.last_name,
        message: body.message,
        videoPath: body.video_path,
      }),
    );
  },
  { feature: "guest_greetings", body: greetingBody, fallbackError: GREETING_ERROR },
);
