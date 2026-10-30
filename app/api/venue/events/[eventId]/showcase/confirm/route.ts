import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireManagerForEvent } from "@/lib/venue/event-guard";
import { acceptVenuePhotoUpload, removeVenuePhoto } from "@/lib/venue/photo-upload";
import { addShowcasePhoto } from "@/lib/venue/showcase";
import { withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, uuid } from "@/lib/api/schemas";

// Фотографии за промоција, step 2 (manager-only, 0109): the bytes must be a
// real image (any format the bucket takes, up to its 50 MB, 0040), then it
// is moved next to the venue's other photos and recorded for the event.

const SHOWCASE_MAX_BYTES = 50 * 1024 * 1024;
const UNSUPPORTED_ERROR = "Датотеката не е поддржана слика. Изберете JPEG, PNG, WebP, GIF или AVIF до 50 MB.";

export const POST = withPublic(
  async ({ request, params, body }) => {
    const guard = await requireManagerForEvent(request, params.eventId);
    if (guard instanceof NextResponse) return guard;

    const path = await acceptVenuePhotoUpload(guard.venueId, body.path, {
      types: ["jpg", "png", "webp", "gif", "avif"],
      maxBytes: SHOWCASE_MAX_BYTES,
      refusedMessage: UNSUPPORTED_ERROR,
      finalPath: (extension) => `${guard.venueId}/${params.eventId}-${Date.now()}.${extension}`,
    });
    try {
      return NextResponse.json(await addShowcasePhoto(params.eventId, path, createServiceRoleClient()));
    } catch (err) {
      // E.g. the plan doesn't include showcase photos (0049's trigger): keep no orphan file.
      await removeVenuePhoto(path).catch(() => {});
      throw err;
    }
  },
  {
    params: z.object({ eventId: uuid }),
    invalidJsonError: INVALID_JSON_ERROR,
    body: z.object({ path: z.string().min(1).max(200) }),
    fallbackError: "Не успеа прикачувањето на фотографијата.",
  },
);
