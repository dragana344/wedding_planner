import { NextResponse } from "next/server";
import { ALBUM_RATE_LIMITS, ALBUM_UPLOAD_ERROR, videoUploadBody, withGuestAlbum } from "@/lib/media/guest-api";
import { createVideoUpload } from "@/lib/media/greetings";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// C7: a signed upload for a video greeting (≤ 100 MB, ≤ 30 s checked in the
// browser); the greeting itself is posted to ../ with the returned path.
export const POST = withGuestAlbum(
  async ({ request, params, body, album }) => {
    for (const [rule, subject] of [
      [ALBUM_RATE_LIMITS.videoUpload, `${params.token}:${clientIp(request)}`],
      [ALBUM_RATE_LIMITS.videoUploadPerEvent, album.eventId],
    ] as const) {
      const limit = await checkRateLimit(rule, subject);
      if (!limit.ok) return rateLimitedResponse(limit);
    }
    return NextResponse.json(await createVideoUpload(album.eventId, body.bytes));
  },
  { body: videoUploadBody, fallbackError: ALBUM_UPLOAD_ERROR },
);
