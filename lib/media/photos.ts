import "server-only";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sniffImageType } from "@/lib/image-type";
import { MAX_PHOTO_BYTES } from "@/lib/media/limits";
import { assertQuotaFor } from "@/lib/media/album";
import { MEDIA_BUCKET, PENDING_PREFIX, PHOTO_UPLOAD_BUCKET, readObjectHead, removeObject } from "@/lib/media/storage";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// Guests' album photos (C1, C3, C10). Uploads go browser → Storage through a
// signed URL (Vercel's 4.5 MB body limit), then confirm checks the bytes, the
// real size and the quota before the photo joins the album.

export type EventPhoto = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  uploaderName: string | null;
  hidden: boolean;
  createdAt: string;
  bytes: number;
};

export type PhotoFile = { id: string; path: string; bytes: number; createdAt: string; mime: string; uploaderName: string | null };

export const PHOTO_TOO_LARGE_ERROR = "Фотографијата е преголема (најмногу 15 MB).";
export const UNSUPPORTED_MEDIA_ERROR = "Датотеката не е поддржана слика. Изберете JPEG, PNG или WebP.";
export const INVALID_MEDIA_UPLOAD_ERROR = "Неважечко прикачување.";

const ALBUM_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SIGNED_VIEW_SECONDS = 60 * 60;

function pendingPattern(eventId: string): RegExp {
  return new RegExp(`^${PENDING_PREFIX}/${eventId}/${UUID}$`);
}

/** Step 1: a signed upload for a server-chosen path, if the album has room. */
export async function createPhotoUpload(eventId: string, declaredBytes: number): Promise<{ path: string; token: string; bucket: string }> {
  if (declaredBytes > MAX_PHOTO_BYTES) throw new Error(PHOTO_TOO_LARGE_ERROR);
  await assertQuotaFor(eventId, declaredBytes);
  const { data, error } = await createServiceRoleClient()
    .storage.from(PHOTO_UPLOAD_BUCKET)
    .createSignedUploadUrl(`${PENDING_PREFIX}/${eventId}/${randomUUID()}`);
  if (error) throw error;
  return { path: data.path, token: data.token, bucket: PHOTO_UPLOAD_BUCKET };
}

/**
 * Step 2: the uploaded bytes must be a JPEG, PNG or WebP of at most 15 MB
 * that still fits the album; then the file moves to its final name (extension
 * from the sniffed type) and gets its row. Anything refused is deleted.
 */
export async function confirmPhotoUpload(
  eventId: string,
  input: { path: string; uploaderName?: string | null; width?: number; height?: number },
): Promise<{ id: string }> {
  if (!pendingPattern(eventId).test(input.path)) throw new Error(INVALID_MEDIA_UPLOAD_ERROR);
  const object = await readObjectHead(input.path, PHOTO_UPLOAD_BUCKET);
  if (!object) throw new Error(INVALID_MEDIA_UPLOAD_ERROR);

  const refuse = async (message: string): Promise<never> => {
    await removeObject(input.path, PHOTO_UPLOAD_BUCKET);
    throw new Error(message);
  };
  if (object.size > MAX_PHOTO_BYTES) return refuse(PHOTO_TOO_LARGE_ERROR);
  const extension = sniffImageType(object.head);
  if (extension !== "jpg" && extension !== "png" && extension !== "webp") return refuse(UNSUPPORTED_MEDIA_ERROR);
  try {
    await assertQuotaFor(eventId, object.size);
  } catch (err) {
    return refuse((err as Error).message);
  }

  const client = createServiceRoleClient();
  const id = randomUUID();
  const finalPath = `${eventId}/photos/${id}.${extension}`;
  const { error: moveError } = await client.storage.from(PHOTO_UPLOAD_BUCKET).move(input.path, finalPath, { destinationBucket: MEDIA_BUCKET });
  if (moveError) throw moveError;

  const uploaderName = input.uploaderName?.trim().slice(0, 120) || null;
  const { error } = await client.from("event_photos").insert({
    id,
    event_id: eventId,
    storage_path: finalPath,
    bytes: object.size,
    mime: ALBUM_TYPES[extension],
    width: input.width ?? null,
    height: input.height ?? null,
    uploader_name: uploaderName,
    consent_at: new Date().toISOString(),
  });
  if (error) {
    await removeObject(finalPath);
    throw error;
  }
  return { id };
}

type PhotoRow = {
  id: string;
  storage_path: string;
  bytes: number;
  width: number | null;
  height: number | null;
  uploader_name: string | null;
  hidden_at: string | null;
  created_at: string;
};

/** The couple's album, newest first, with signed links valid for an hour. */
export async function listPhotos(
  eventId: string,
  opts: { includeHidden?: boolean; limit?: number; before?: string } = {},
): Promise<EventPhoto[]> {
  const client = createServiceRoleClient();
  let query = client
    .from("event_photos")
    .select("id, storage_path, bytes, width, height, uploader_name, hidden_at, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit ?? 60);
  if (!opts.includeHidden) query = query.is("hidden_at", null);
  if (opts.before) query = query.lt("created_at", opts.before);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as PhotoRow[];
  if (rows.length === 0) return [];

  const { data: signed, error: signError } = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_VIEW_SECONDS);
  if (signError) throw signError;
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return rows.map((r) => ({
    id: r.id,
    url: urls.get(r.storage_path) ?? "",
    width: r.width,
    height: r.height,
    uploaderName: r.uploader_name,
    hidden: r.hidden_at !== null,
    createdAt: r.created_at,
    bytes: Number(r.bytes),
  }));
}

export async function setPhotoHidden(eventId: string, photoId: string, hidden: boolean): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from("event_photos")
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq("event_id", eventId)
    .eq("id", photoId);
  if (error) throw error;
}

/** Deletes the photo; the 0080 trigger queues its file, drained right away. */
export async function deletePhoto(eventId: string, photoId: string): Promise<void> {
  const { error } = await createServiceRoleClient().from("event_photos").delete().eq("event_id", eventId).eq("id", photoId);
  if (error) throw error;
  await drainStorageCleanupQueue().catch(() => {}); // the hourly cron retries
}

/** Every visible photo, oldest first, for "download all". */
export async function listPhotoFiles(eventId: string): Promise<PhotoFile[]> {
  const files: PhotoFile[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await createServiceRoleClient()
      .from("event_photos")
      .select("id, storage_path, bytes, mime, uploader_name, created_at")
      .eq("event_id", eventId)
      .is("hidden_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      files.push({ id: r.id, path: r.storage_path, bytes: Number(r.bytes), createdAt: r.created_at, mime: r.mime, uploaderName: r.uploader_name });
    }
    if ((data ?? []).length < PAGE) return files;
  }
}
