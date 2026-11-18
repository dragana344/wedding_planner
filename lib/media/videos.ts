import "server-only";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sniffVideoType } from "@/lib/media/sniff";
import { MAX_VIDEO_BYTES } from "@/lib/media/limits";
import { assertQuotaFor } from "@/lib/media/album";
import { MEDIA_BUCKET, PENDING_PREFIX, readObjectHead, removeObject } from "@/lib/media/storage";
import { INVALID_MEDIA_UPLOAD_ERROR } from "@/lib/media/photos";

// Guests' videos: a video greeting (C7) or a video in the shared album (0151).
// Both go browser → Storage through a signed URL, then a confirm step checks
// the bytes, the size and the quota before the file gets its final name. The
// length limit (the package's max_video_seconds) is checked in the browser:
// the server can't read a video's duration from its first bytes.

export const VIDEO_TOO_LARGE_ERROR = "Видеото е преголемо (најмногу 500 MB).";
export const UNSUPPORTED_VIDEO_ERROR = "Видеото не е поддржано. Снимете MP4, MOV или WebM.";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const VIDEO_MIME = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" } as const;

export async function createVideoUpload(eventId: string, declaredBytes: number): Promise<{ path: string; token: string; bucket: string }> {
  if (declaredBytes > MAX_VIDEO_BYTES) throw new Error(VIDEO_TOO_LARGE_ERROR);
  await assertQuotaFor(eventId, declaredBytes);
  const { data, error } = await createServiceRoleClient()
    .storage.from(MEDIA_BUCKET)
    .createSignedUploadUrl(`${PENDING_PREFIX}/${eventId}/${randomUUID()}`);
  if (error) throw error;
  return { path: data.path, token: data.token, bucket: MEDIA_BUCKET };
}

/** Checks an uploaded video and moves it to its final name; returns path, size and type. */
export async function acceptVideo(eventId: string, pendingPath: string): Promise<{ path: string; bytes: number; mime: string }> {
  if (!new RegExp(`^${PENDING_PREFIX}/${eventId}/${UUID}$`).test(pendingPath)) throw new Error(INVALID_MEDIA_UPLOAD_ERROR);
  const object = await readObjectHead(pendingPath);
  if (!object) throw new Error(INVALID_MEDIA_UPLOAD_ERROR);

  const refuse = async (message: string): Promise<never> => {
    await removeObject(pendingPath);
    throw new Error(message);
  };
  if (object.size > MAX_VIDEO_BYTES) return refuse(VIDEO_TOO_LARGE_ERROR);
  const extension = sniffVideoType(object.head);
  if (!extension) return refuse(UNSUPPORTED_VIDEO_ERROR);
  try {
    await assertQuotaFor(eventId, object.size);
  } catch (err) {
    return refuse((err as Error).message);
  }

  const finalPath = `${eventId}/videos/${randomUUID()}.${extension}`;
  const { error } = await createServiceRoleClient().storage.from(MEDIA_BUCKET).move(pendingPath, finalPath);
  if (error) throw error;
  return { path: finalPath, bytes: object.size, mime: VIDEO_MIME[extension] };
}

/** A guest's video joins the shared album, next to the photos (event_photos, 0151). */
export async function confirmAlbumVideo(eventId: string, input: { path: string; uploaderName?: string | null }): Promise<{ id: string }> {
  const video = await acceptVideo(eventId, input.path);
  const id = randomUUID();
  const { error } = await createServiceRoleClient()
    .from("event_photos")
    .insert({
      id,
      event_id: eventId,
      storage_path: video.path,
      bytes: video.bytes,
      mime: video.mime,
      uploader_name: input.uploaderName?.trim().slice(0, 120) || null,
      consent_at: new Date().toISOString(),
    });
  if (error) {
    await removeObject(video.path);
    throw error;
  }
  return { id };
}
