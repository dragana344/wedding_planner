import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { INVITATION_PHOTO_BUCKET } from "@/lib/couple/invitations";
import { listPhotoFiles } from "@/lib/media/photos";
import { openObjectStream } from "@/lib/media/storage";
import { planZipParts } from "@/lib/media/zip";
import { albumEntryName, safeFileName, uniqueFileNames } from "./names";

// "Фотографии и видеа" for the keepsake download (group A task 7): the
// invitation photo, the guests' video greetings named by guest and the
// visible album, in folders, split into ZIP parts like the album download
// (planZipParts) and streamed from Storage without buffering.

export const MEDIA_FOLDERS = { invitation: "Покана", greetings: "Видео честитки", album: "Фотографии и видеа" } as const;

export type KeepsakeMediaFile = {
  /** Path inside the ZIP, folder included. */
  name: string;
  bytes: number;
  kind: "invitation" | "greeting" | "album";
  open: () => Promise<ReadableStream<Uint8Array>>;
};

function extension(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1);
}

async function invitationFiles(eventId: string): Promise<KeepsakeMediaFile[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_invitations").select("photo_path").eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  const path = data?.photo_path as string | null | undefined;
  if (!path) return [];
  // The size only steers the split into parts; the bucket caps a photo at 50 MB.
  const { data: listed } = await client.storage.from(INVITATION_PHOTO_BUCKET).list("", { search: path, limit: 1 });
  const bytes = Number(listed?.find((o) => o.name === path)?.metadata?.size ?? 0);
  return [{ name: `${MEDIA_FOLDERS.invitation}/Покана.${extension(path)}`, bytes, kind: "invitation", open: () => openObjectStream(path, INVITATION_PHOTO_BUCKET) }];
}

async function greetingVideos(eventId: string, before?: string): Promise<KeepsakeMediaFile[]> {
  let query = createServiceRoleClient()
    .from("event_greetings")
    .select("first_name, last_name, video_path, video_bytes")
    .eq("event_id", eventId)
    .is("hidden_at", null)
    .not("video_path", "is", null);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { first_name: string; last_name: string; video_path: string; video_bytes: number }[];
  const names = uniqueFileNames(rows.map((r) => `${safeFileName(`${r.first_name} ${r.last_name}`, "Гостин")}.${extension(r.video_path)}`));
  return rows.map((r, i) => ({
    name: `${MEDIA_FOLDERS.greetings}/${names[i]}`,
    bytes: Number(r.video_bytes),
    kind: "greeting",
    open: () => openObjectStream(r.video_path),
  }));
}

async function albumFiles(eventId: string, before?: string): Promise<KeepsakeMediaFile[]> {
  const files = await listPhotoFiles(eventId, before);
  return files.map((file, i) => ({
    name: `${MEDIA_FOLDERS.album}/${albumEntryName(file, i)}`,
    bytes: file.bytes,
    kind: "album",
    open: () => openObjectStream(file.path),
  }));
}

/**
 * Every file, in archive order (invitation, greetings, album), split into
 * parts. `before` pins the greetings and album to the files added before
 * the download page rendered (lib/media/download-pin.ts).
 */
export async function planKeepsakeMedia(eventId: string, before?: string): Promise<KeepsakeMediaFile[][]> {
  const [invitation, greetings, album] = await Promise.all([invitationFiles(eventId), greetingVideos(eventId, before), albumFiles(eventId, before)]);
  return planZipParts([...invitation, ...greetings, ...album]);
}
