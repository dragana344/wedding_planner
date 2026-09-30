import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Private bucket for guests' album photos and video greetings (0080). */
export const MEDIA_BUCKET = "event-media";

/**
 * Unconfirmed photo uploads (0081): capped at 15 MB by the bucket itself, since
 * a signed URL can't bound what is PUT through it. Videos wait in MEDIA_BUCKET.
 */
export const PHOTO_UPLOAD_BUCKET = "event-media-uploads";

/** Where signed uploads land until confirmed: pending/<event>/<uuid>. */
export const PENDING_PREFIX = "pending";

const HEAD_BYTES = 32;

/**
 * The first bytes of a stored object and its full size, without downloading
 * it: a ranged GET on a short-lived signed URL. The size comes from
 * Content-Range ("bytes 0-31/12345"), so it is what Storage holds, not what
 * the browser declared.
 */
export async function readObjectHead(path: string, bucket = MEDIA_BUCKET): Promise<{ head: Uint8Array; size: number } | null> {
  const { data, error } = await createServiceRoleClient().storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data) return null;
  const response = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` }, cache: "no-store" });
  if (!response.ok || !response.body) return null;

  const range = response.headers.get("content-range")?.match(/\/(\d+)$/);
  const size = range ? Number(range[1]) : Number(response.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(size)) {
    void response.body.cancel().catch(() => {});
    return null;
  }

  const reader = response.body.getReader();
  const head = new Uint8Array(Math.min(HEAD_BYTES, size));
  let offset = 0;
  while (offset < head.length) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.length, head.length - offset);
    head.set(value.subarray(0, take), offset);
    offset += take;
  }
  // Not awaited: under Next.js's patched fetch, cancelling a body that was
  // already read to its end never settles, which hung confirm requests.
  void reader.cancel().catch(() => {});
  return { head: head.subarray(0, offset), size };
}

export async function removeObject(path: string, bucket = MEDIA_BUCKET): Promise<void> {
  await createServiceRoleClient().storage.from(bucket).remove([path]);
}

/**
 * Uploads never confirmed (tab closed, file refused mid-way) are removed once
 * older than `maxAgeMs` (default a day). Run by the hourly storage cron.
 */
export async function sweepStalePendingMedia(maxAgeMs = 24 * 60 * 60 * 1000): Promise<{ removed: number }> {
  let removed = 0;
  for (const bucket of [PHOTO_UPLOAD_BUCKET, MEDIA_BUCKET]) removed += await sweepBucket(bucket, Date.now() - maxAgeMs);
  return { removed };
}

async function sweepBucket(bucket: string, cutoff: number): Promise<number> {
  const storage = createServiceRoleClient().storage.from(bucket);
  const { data: folders, error } = await storage.list(PENDING_PREFIX, { limit: 1000 });
  if (error) throw error;
  let removed = 0;
  for (const folder of folders ?? []) {
    const { data: files, error: listError } = await storage.list(`${PENDING_PREFIX}/${folder.name}`, { limit: 1000 });
    if (listError) throw listError;
    const stale = (files ?? [])
      .filter((f) => f.id !== null && new Date(f.created_at ?? 0).getTime() <= cutoff)
      .map((f) => `${PENDING_PREFIX}/${folder.name}/${f.name}`);
    if (stale.length) {
      const { error: removeError } = await storage.remove(stale);
      if (removeError) throw removeError;
      removed += stale.length;
    }
  }
  return removed;
}

/** The object's bytes as a stream (for "download all"); nothing is buffered. */
export async function openObjectStream(path: string): Promise<ReadableStream<Uint8Array>> {
  const { data, error } = await createServiceRoleClient().storage.from(MEDIA_BUCKET).createSignedUrl(path, 15 * 60);
  if (error || !data) throw error ?? new Error("signed URL missing");
  const response = await fetch(data.signedUrl, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`storage download failed: ${response.status}`);
  return response.body;
}
