import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { acceptVideo } from "@/lib/media/videos";
import { MEDIA_BUCKET, removeObject } from "@/lib/media/storage";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// Guests' greetings (C2, C7): a message, and optionally a short video that goes
// through the same signed-upload + confirm path as album videos. Since 0151
// they are sent from the invitation and belong to a guest (guestId); older
// ones from the QR page carry only the name the guest typed.

export { createVideoUpload, VIDEO_TOO_LARGE_ERROR, UNSUPPORTED_VIDEO_ERROR } from "@/lib/media/videos";

export type Greeting = {
  id: string;
  guestId: string | null;
  firstName: string;
  lastName: string;
  message: string;
  videoUrl: string | null;
  hidden: boolean;
  createdAt: string;
};

export const NAME_REQUIRED_ERROR = "Внесете име и презиме.";
export const MESSAGE_REQUIRED_ERROR = "Напишете порака.";

const SIGNED_VIEW_SECONDS = 60 * 60;

export async function createGreeting(
  eventId: string,
  input: { firstName: string; lastName: string; message: string; videoPath?: string | null; guestId?: string | null },
): Promise<{ id: string }> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const message = input.message.trim();
  // A guest's own greeting takes their name from the guest list, which may be one word.
  if (!firstName || (!lastName && !input.guestId)) throw new Error(NAME_REQUIRED_ERROR);
  if (!message) throw new Error(MESSAGE_REQUIRED_ERROR);

  const video = input.videoPath ? await acceptVideo(eventId, input.videoPath) : null;
  const { data, error } = await createServiceRoleClient()
    .from("event_greetings")
    .insert({
      event_id: eventId,
      guest_id: input.guestId ?? null,
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
    .select("id, guest_id, first_name, last_name, message, video_path, hidden_at, created_at")
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
    guestId: r.guest_id,
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
