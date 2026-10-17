import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { LOGO_MAX_BYTES, LOGO_TYPE_ERROR, LOGO_TYPES, setVenueLogoPath, venueLogoUrl } from "@/lib/venue/venue-profile";
import { acceptVenuePhotoUpload, removeVenuePhoto } from "@/lib/venue/photo-upload";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";
import type { ImageExtension } from "@/lib/image-type";
import { NOT_AUTHENTICATED_ERROR, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR } from "@/lib/api/schemas";

// Step 2 of a logo upload (owner-only, spec D4): the bytes must be a PNG,
// JPG or WEBP of at most 5 MB; then it becomes the venue's logo and the
// previous one is queued for deletion (0074's trigger).

const OWNER_REQUIRED_ERROR = "Потребна е најава како сопственик.";

export const POST = withPublic(
  async ({ request, body }) => {
    const venueId = await getCurrentVenueId(await createServerSupabaseClient());
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    if (!(await requireOwnerElevation(request, venueId))) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });

    const client = createServiceRoleClient();
    const path = await acceptVenuePhotoUpload(venueId, body.path, {
      types: Object.keys(LOGO_TYPES) as ImageExtension[],
      maxBytes: LOGO_MAX_BYTES,
      refusedMessage: LOGO_TYPE_ERROR,
      finalPath: (extension) => `${venueId}/logo-${Date.now()}.${extension}`,
    });
    try {
      await setVenueLogoPath(venueId, path, client);
    } catch (err) {
      // Same reasoning as the showcase-photo confirm route: don't leave the
      // just-moved file as an orphan if recording it fails (final review
      // finding — this route was the one case that didn't clean up).
      await removeVenuePhoto(path).catch(() => {});
      throw err;
    }
    await drainStorageCleanupQueue().catch(() => {}); // the replaced logo; the hourly cron retries on failure
    return NextResponse.json({ url: venueLogoUrl(client, path) });
  },
  {
    invalidJsonError: INVALID_JSON_ERROR,
    body: z.object({ path: z.string().min(1).max(200) }),
    fallbackError: "Не успеа прикачувањето на логото.",
  },
);
