import { NextResponse } from "next/server";
import { ALBUM_RATE_LIMITS, ALBUM_UPLOAD_ERROR, photoUploadBody, withGuestAlbum } from "@/lib/media/guest-api";
import { createPhotoUpload } from "@/lib/media/photos";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// C1 step 1: a signed upload for one guest photo. The photo goes straight
// from the browser to Storage (Vercel's 4.5 MB body limit), then ./confirm.
export const POST = withGuestAlbum(
  async ({ request, params, body, album }) => {
    for (const [rule, subject] of [
      [ALBUM_RATE_LIMITS.upload, `${params.token}:${clientIp(request)}`],
      [ALBUM_RATE_LIMITS.uploadPerEvent, album.eventId],
    ] as const) {
      const limit = await checkRateLimit(rule, subject);
      if (!limit.ok) return rateLimitedResponse(limit);
    }
    return NextResponse.json(await createPhotoUpload(album.eventId, body.bytes));
  },
  { feature: "photo_album", body: photoUploadBody, fallbackError: ALBUM_UPLOAD_ERROR },
);
