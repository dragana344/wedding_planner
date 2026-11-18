import { NextResponse } from "next/server";
import { ALBUM_RATE_LIMITS, ALBUM_UPLOAD_ERROR, lockedResponse, videoUploadBody, withGuestAlbum } from "@/lib/media/guest-api";
import { getEventFeatures } from "@/lib/entitlements/server";
import { createVideoUpload } from "@/lib/media/videos";
import { fitsVideoLength, videoSecondsLimit, videoTooLongError } from "@/lib/media/limits";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// 0151: a signed upload for a guest's video in the shared album (≤ 500 MB, and
// no longer than the package's max_video_seconds as the browser measured it).
// Confirmed through ./confirm.
export const POST = withGuestAlbum(
  async ({ request, params, body, album }) => {
    const seconds = videoSecondsLimit((await getEventFeatures(album.eventId)).max_video_seconds);
    if (seconds === 0) return lockedResponse();
    if (!fitsVideoLength(seconds, body.seconds)) return NextResponse.json({ error: videoTooLongError(seconds!) }, { status: 400 });
    for (const [rule, subject] of [
      [ALBUM_RATE_LIMITS.videoUpload, `${params.token}:${clientIp(request)}`],
      [ALBUM_RATE_LIMITS.videoUploadPerEvent, album.eventId],
    ] as const) {
      const limit = await checkRateLimit(rule, subject);
      if (!limit.ok) return rateLimitedResponse(limit);
    }
    return NextResponse.json(await createVideoUpload(album.eventId, body.bytes));
  },
  { feature: ["photo_album", "max_video_seconds"], body: videoUploadBody, fallbackError: ALBUM_UPLOAD_ERROR },
);
