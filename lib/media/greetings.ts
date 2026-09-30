import "server-only";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sniffVideoType } from "@/lib/media/sniff";
import { MAX_VIDEO_BYTES } from "@/lib/media/limits";
import { assertQuotaFor } from "@/lib/media/album";
import { MEDIA_BUCKET, PENDING_PREFIX, readObjectHead, removeObject } from "@/lib/media/storage";
import { INVALID_MEDIA_UPLOAD_ERROR } from "@/lib/media/photos";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// Guests' greetings (C2, C7): first and last name are required; a short video
// is optional and goes through the same signed-upload + confirm path as photos.

export type Greeting = {
  id: string;
  firstName: string;
  lastName: string;
  message: string;
  videoUrl: string | null;
  hidden: boolean;
  createdAt: string;
};

export const NAME_REQUIRED_ERROR = "Внесете име и презиме.";
export const MESSAGE_REQUIRED_ERROR = "Напишете порака.";
export const VIDEO_TOO_LARGE_ERROR = "Видеото е преголемо (најмногу 100 MB).";
export const UNSUPPORTED_VIDEO_ERROR = "Видеото не е поддржано. Снимете MP4, MOV или WebM.";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SIGNED_VIEW_SECONDS = 60 * 60;

export async function createVideoUpload(eventId: string, declaredBytes: number): Promise<{ path: string; token: string; bucket: string }> {
  if (declaredBytes > MAX_VIDEO_BYTES) throw new Error(VIDEO_TOO_LARGE_ERROR);
  await assertQuotaFor(eventId, declaredBytes);
  const { data, error } = await createServiceRoleClient()
    .storage.from(MEDIA_BUCKET)
    .createSignedUploadUrl(`${PENDING_PREFIX}/${eventId}/${randomUUID()}`);
  if (error) throw error;
  return { path: data.path, token: data.token, bucket: MEDIA_BUCKET };
}

/** Checks an uploaded video and moves it to its final name; returns path and size. */
async function acceptVideo(eventId: string, pendingPath: string): Promise<{ path: string; bytes: number }> {
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
  return { path: finalPath, bytes: object.size };
}

export async function createGreeting(
  eventId: string,
  input: { firstName: string; lastName: string; message: string; videoPath?: string | null },
): Promise<{ id: string }> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const message = input.message.trim();
  if (!firstName || !lastName) throw new Error(NAME_REQUIRED_ERROR);
  if (!message) throw new Error(MESSAGE_REQUIRED_ERROR);

  const video = input.videoPath ? await acceptVideo(eventId, input.videoPath) : null;
  const { data, error } = await createServiceRoleClient()
    .from("event_greetings")
    .insert({
      event_id: eventId,
      first_name: firstName,
      last_name: lastName,
      message,
      video_path: video?.path ?? null,
      video_bytes: video?.bytes ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (video) await removeObject(video.path);
    throw error;
  }
  return { id: data.id };
}

/** The couple's greetings, newest first, with signed video links valid for an hour. */
export async function listGreetings(eventId: string, opts: { includeHidden?: boolean } = {}): Promise<Greeting[]> {
  const client = createServiceRoleClient();
  let query = client
    .from("event_greetings")
    .select("id, first_name, last_name, message, video_path, hidden_at, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (!opts.includeHidden) query = query.is("hidden_at", null);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  const videoPaths = rows.map((r) => r.video_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (videoPaths.length) {
    const { data: signed, error: signError } = await client.storage.from(MEDIA_BUCKET).createSignedUrls(videoPaths, SIGNED_VIEW_SECONDS);
    if (signError) throw signError;
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  return rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    message: r.message,
    videoUrl: r.video_path ? (urls.get(r.video_path) ?? null) : null,
    hidden: r.hidden_at !== null,
    createdAt: r.created_at,
  }));
}

export async function setGreetingHidden(eventId: string, id: string, hidden: boolean): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from("event_greetings")
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq("event_id", eventId)
    .eq("id", id);
  if (error) throw error;
}

/** Deletes the greeting; the 0080 trigger queues its video, drained right away. */
export async function deleteGreeting(eventId: string, id: string): Promise<void> {
  const { error } = await createServiceRoleClient().from("event_greetings").delete().eq("event_id", eventId).eq("id", id);
  if (error) throw error;
  await drainStorageCleanupQueue().catch(() => {});
}
