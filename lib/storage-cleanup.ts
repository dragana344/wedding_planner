import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Deletes the storage objects queued by migration 0038's triggers (DATA-011)
 * and removes their queue rows. Idempotent: removing an already-missing
 * object is not an error, so a crashed run is simply retried.
 */
export async function drainStorageCleanupQueue(batchSize = 500): Promise<{ removed: number }> {
  const client = createServiceRoleClient();
  const { data: rows, error } = await client
    .from("storage_cleanup_queue")
    .select("id, bucket, path")
    .order("id")
    .limit(batchSize);
  if (error) throw error;
  if (!rows?.length) return { removed: 0 };

  const byBucket = new Map<string, { ids: number[]; paths: string[] }>();
  for (const row of rows) {
    const entry = byBucket.get(row.bucket) ?? { ids: [], paths: [] };
    entry.ids.push(row.id);
    entry.paths.push(row.path);
    byBucket.set(row.bucket, entry);
  }

  let removed = 0;
  for (const [bucket, { ids, paths }] of Array.from(byBucket)) {
    const { error: removeError } = await client.storage.from(bucket).remove(paths);
    if (removeError) throw removeError;
    const { error: dequeueError } = await client.from("storage_cleanup_queue").delete().in("id", ids);
    if (dequeueError) throw dequeueError;
    removed += paths.length;
  }
  return { removed };
}

/**
 * SEC-005: invitation photos are uploaded to uploads/<event>/<uuid> and moved
 * out on confirm. Uploads never confirmed (tab closed, file refused) are
 * removed once they are a day old.
 */
export async function sweepStaleInvitationUploads(maxAgeMs = 24 * 60 * 60 * 1000): Promise<{ removed: number }> {
  const storage = createServiceRoleClient().storage.from("invitation-photos");
  const { data: folders, error } = await storage.list("uploads", { limit: 1000 });
  if (error) throw error;
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const folder of folders ?? []) {
    const { data: files, error: listError } = await storage.list(`uploads/${folder.name}`, { limit: 1000 });
    if (listError) throw listError;
    const stale = (files ?? [])
      .filter((f) => f.id !== null && new Date(f.created_at ?? 0).getTime() < cutoff)
      .map((f) => `uploads/${folder.name}/${f.name}`);
    if (stale.length) {
      const { error: removeError } = await storage.remove(stale);
      if (removeError) throw removeError;
      removed += stale.length;
    }
  }
  return { removed };
}
