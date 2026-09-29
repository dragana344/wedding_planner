// One-off sweep for storage objects no row points at (DATA-011): photos left
// behind before the cleanup queue (migration 0038) existed.
//
//   node --env-file=.env.local scripts/storage-orphan-sweep.mjs            # report only
//   node --env-file=.env.local scripts/storage-orphan-sweep.mjs --delete   # also remove them
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the target project.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. --env-file=.env.local).");
  process.exit(1);
}
const shouldDelete = process.argv.includes("--delete");
const admin = createClient(url, key, { auth: { persistSession: false } });

const BUCKETS = {
  "menu-item-photos": { table: "menu_items" },
  "event-showcase-photos": { table: "event_showcase_photos" },
  "invitation-photos": { table: "event_invitations" },
};

async function listAll(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...(await listAll(bucket, path)));
      else if (entry.name !== ".emptyFolderPlaceholder") out.push(path);
    }
    if (data.length < 1000) return out;
  }
}

async function referencedPaths(table) {
  const paths = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select("photo_path").not("photo_path", "is", null).range(from, from + 999);
    if (error) throw error;
    data.forEach((r) => paths.add(r.photo_path));
    if (data.length < 1000) return paths;
  }
}

let total = 0;
for (const [bucket, { table }] of Object.entries(BUCKETS)) {
  const [objects, referenced] = await Promise.all([listAll(bucket), referencedPaths(table)]);
  const orphans = objects.filter((p) => !referenced.has(p));
  total += orphans.length;
  console.log(`${bucket}: ${objects.length} objects, ${referenced.size} referenced, ${orphans.length} orphaned`);
  orphans.forEach((p) => console.log(`  orphan: ${p}`));
  if (shouldDelete && orphans.length) {
    for (let i = 0; i < orphans.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(orphans.slice(i, i + 100));
      if (error) throw error;
    }
    console.log(`  removed ${orphans.length}`);
  }
}
console.log(shouldDelete ? `Done: removed ${total} orphaned object(s).` : `Done: ${total} orphaned object(s). Re-run with --delete to remove them.`);
