import "server-only";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sniffImageType, type ImageExtension } from "@/lib/image-type";
import { PENDING_PREFIX, readObjectHead, removeObject } from "@/lib/media/storage";

// The venue's own photos (logo, event showcase photos) in the public
// event-showcase-photos bucket. Like the couple's invitation photo (SEC-005)
// the browser uploads straight to Storage through a one-time signed URL —
// never through our server, whose body limit (4.5 MB on Vercel) is below the
// photos' — to pending/<venue>/<uuid>; the gated confirm step then checks
// the bytes are a real image and moves it to its final name. Staff cannot
// write the bucket themselves (0107); the hourly cron sweeps what is never
// confirmed (sweepStalePendingMedia).

export const VENUE_PHOTO_BUCKET = "event-showcase-photos";
export const INVALID_VENUE_UPLOAD_ERROR = "Неважечко прикачување.";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A one-time signed upload into the venue's pending folder. */
export async function createVenuePhotoUpload(venueId: string): Promise<{ path: string; token: string }> {
  const { data, error } = await createServiceRoleClient()
    .storage.from(VENUE_PHOTO_BUCKET)
    .createSignedUploadUrl(`${PENDING_PREFIX}/${venueId}/${randomUUID()}`);
  if (error) throw error;
  return { path: data.path, token: data.token };
}

/**
 * Checks a pending upload of `venueId` is one of `types` and at most
 * `maxBytes`, then moves it to `finalPath(extension)` — the extension is the
 * sniffed type's, never the file name's. A refused file is deleted and
 * `refusedMessage` thrown.
 */
export async function acceptVenuePhotoUpload(
  venueId: string,
  uploadPath: string,
  options: { types: readonly ImageExtension[]; maxBytes: number; refusedMessage: string; finalPath: (extension: ImageExtension) => string },
): Promise<string> {
  if (!new RegExp(`^${PENDING_PREFIX}/${venueId}/${UUID}$`).test(uploadPath)) throw new Error(INVALID_VENUE_UPLOAD_ERROR);
  const object = await readObjectHead(uploadPath, VENUE_PHOTO_BUCKET);
  if (!object) throw new Error(INVALID_VENUE_UPLOAD_ERROR);

  const extension = sniffImageType(object.head);
  if (!extension || !options.types.includes(extension) || object.size > options.maxBytes) {
    await removeObject(uploadPath, VENUE_PHOTO_BUCKET);
    throw new Error(options.refusedMessage);
  }

  const finalPath = options.finalPath(extension);
  const { error } = await createServiceRoleClient().storage.from(VENUE_PHOTO_BUCKET).move(uploadPath, finalPath);
  if (error) throw error;
  return finalPath;
}

export async function removeVenuePhoto(path: string): Promise<void> {
  await removeObject(path, VENUE_PHOTO_BUCKET);
}
