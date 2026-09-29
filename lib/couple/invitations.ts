// lib/couple/invitations.ts
import "server-only";
import { randomBytes, randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { IMAGE_SNIFF_BYTES, sniffImageType } from "@/lib/image-type";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

export interface Invitation {
  event_id: string;
  template_id: string;
  message: string | null;
  photo_path: string | null;
  public_slug: string;
}

export interface InvitationInput {
  template_id: string;
  message: string | null;
}

const COLUMNS = "event_id, template_id, message, photo_path, public_slug";
const BUCKET = "invitation-photos";

function generateSlug(): string {
  return randomBytes(9).toString("base64url");
}

export async function getInvitation(eventId: string): Promise<Invitation | null> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_invitations").select(COLUMNS).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertInvitation(eventId: string, input: InvitationInput): Promise<Invitation> {
  const client = createServiceRoleClient();
  const existing = await getInvitation(eventId);
  if (existing) {
    const { data, error } = await client
      .from("event_invitations")
      .update(input)
      .eq("event_id", eventId)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await client
    .from("event_invitations")
    .insert({ event_id: eventId, ...input, public_slug: generateSlug() })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export function getInvitationPhotoUrl(photoPath: string | null): string | null {
  if (!photoPath) return null;
  const { data } = createServiceRoleClient().storage.from(BUCKET).getPublicUrl(photoPath);
  return data.publicUrl;
}

const UPLOAD_PREFIX = "uploads";
const UPLOAD_PATH = /^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
export const UNSUPPORTED_PHOTO_ERROR = "Датотеката не е поддржана слика. Изберете JPEG, PNG, WebP, GIF или AVIF.";
export const INVALID_UPLOAD_ERROR = "Неважечко прикачување.";

/**
 * SEC-005, step 1: a one-time signed upload for a server-chosen staging path,
 * so the photo goes from the browser straight to Storage (Vercel caps function
 * request bodies at 4.5 MB). The bucket enforces image content types and the
 * 50 MB limit (migration 0040).
 */
export async function createInvitationPhotoUpload(eventId: string): Promise<{ path: string; token: string }> {
  const path = `${UPLOAD_PREFIX}/${eventId}/${randomUUID()}`;
  const { data, error } = await createServiceRoleClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path: data.path, token: data.token };
}

/** First bytes of a stored object, without downloading the whole photo. */
async function readObjectHead(path: string): Promise<Uint8Array | null> {
  const { data, error } = await createServiceRoleClient().storage.from(BUCKET).createSignedUrl(path, 60);
  if (error) return null;
  const response = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${IMAGE_SNIFF_BYTES - 1}` }, cache: "no-store" });
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (length < IMAGE_SNIFF_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
  }
  await reader.cancel().catch(() => {});
  const head = new Uint8Array(Math.min(length, IMAGE_SNIFF_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, head.length - offset);
    head.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= head.length) break;
  }
  return head;
}

/**
 * SEC-005, step 2: check the uploaded bytes really are a supported image,
 * then move it to its final name (extension from the sniffed type, never the
 * file name) and point the invitation at it. Anything else is deleted. The
 * previous photo is queued for deletion by migration 0038's trigger.
 */
export async function confirmInvitationPhotoUpload(eventId: string, uploadPath: string): Promise<string> {
  if (!UPLOAD_PATH.test(uploadPath) || !uploadPath.startsWith(`${UPLOAD_PREFIX}/${eventId}/`)) {
    throw new Error(INVALID_UPLOAD_ERROR);
  }
  const client = createServiceRoleClient();
  const head = await readObjectHead(uploadPath);
  if (!head) throw new Error(INVALID_UPLOAD_ERROR);

  const extension = sniffImageType(head);
  if (!extension) {
    await client.storage.from(BUCKET).remove([uploadPath]);
    throw new Error(UNSUPPORTED_PHOTO_ERROR);
  }

  const finalPath = `${eventId}-${Date.now()}.${extension}`;
  const { error: moveError } = await client.storage.from(BUCKET).move(uploadPath, finalPath);
  if (moveError) throw moveError;
  const { error } = await client.from("event_invitations").update({ photo_path: finalPath }).eq("event_id", eventId);
  if (error) throw error;
  await drainStorageCleanupQueue().catch(() => {}); // the replaced photo; the hourly cron retries on failure
  return finalPath;
}

export interface PublicInvitation {
  couple_names: string;
  event_date: string;
  start_time: string | null;
  venue_name: string;
  room_names: string[];
  template_id: string;
  message: string | null;
  photo_path: string | null;
}

export async function getInvitationBySlug(slug: string): Promise<PublicInvitation | null> {
  const client = createServiceRoleClient();
  const { data: invitation, error } = await client
    .from("event_invitations")
    .select("event_id, template_id, message, photo_path")
    .eq("public_slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!invitation) return null;

  const { data: event } = await client
    .from("events")
    .select("couple_names, event_date, start_time, venue_id, event_rooms(rooms(name))")
    .eq("id", invitation.event_id)
    .single();
  if (!event) return null;

  const { data: venue } = await client.from("venues").select("name").eq("id", event.venue_id).single();
  const roomNames = ((event.event_rooms ?? []) as { rooms: { name: string } | { name: string }[] | null }[])
    .map((r) => (Array.isArray(r.rooms) ? r.rooms[0]?.name : r.rooms?.name))
    .filter((n): n is string => Boolean(n));

  return {
    couple_names: event.couple_names,
    event_date: event.event_date,
    start_time: event.start_time,
    venue_name: venue?.name ?? "",
    room_names: roomNames,
    template_id: invitation.template_id,
    message: invitation.message,
    photo_path: invitation.photo_path,
  };
}
