import "server-only";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sniffImageType } from "@/lib/image-type";

// Photo/PDF attachments on internal admin tickets (0153). Same bytes-not-
// name/declared-MIME rule as the guest-facing uploads (SEC-005), scaled
// down for an admin-only, low-volume feature: no pending/confirm two-step,
// no quota — one direct upload per file, straight through the Server
// Action that creates the task or the comment (lib/admin/task-actions-core.ts).

export const ATTACHMENT_BUCKET = "admin-task-attachments";
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

export const ATTACHMENT_TOO_LARGE_ERROR = "Прилогот е преголем (најмногу 8 MB).";
export const UNSUPPORTED_ATTACHMENT_ERROR = "Неподдржан тип прилог. Изберете JPEG, PNG, WebP или PDF.";
export const TOO_MANY_ATTACHMENTS_ERROR = `Најмногу ${MAX_ATTACHMENTS} прилози.`;

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/** Sniffs the real file type from its first bytes and, if it's a photo or a
 * PDF, uploads it under a fresh name. Throws a user-facing message (too
 * large, unsupported type) otherwise — the caller never writes a row for a
 * file this rejected. */
export async function uploadTaskAttachment(file: File): Promise<string> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(ATTACHMENT_TOO_LARGE_ERROR);
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const image = sniffImageType(head);
  const extension = image === "jpg" || image === "png" || image === "webp" ? image : isPdf(head) ? "pdf" : null;
  if (!extension) throw new Error(UNSUPPORTED_ATTACHMENT_ERROR);
  const path = `${randomUUID()}.${extension}`;
  const { error } = await createServiceRoleClient()
    .storage.from(ATTACHMENT_BUCKET)
    .upload(path, file, { cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

/** Best-effort cleanup: a partially-failed upload batch, or a deleted task/comment's files. */
export async function removeTaskAttachments(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await createServiceRoleClient().storage.from(ATTACHMENT_BUCKET).remove(paths);
}

/** Signed links to view them, valid an hour — same shape as the other
 * private buckets (lib/media/photos.ts listPhotos). */
export async function signedAttachmentUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await createServiceRoleClient().storage.from(ATTACHMENT_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  return new Map((data ?? []).filter((s): s is typeof s & { path: string; signedUrl: string } => Boolean(s.path && s.signedUrl)).map((s) => [s.path, s.signedUrl]));
}
