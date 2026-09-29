// Restores storage objects from a backup directory produced by
// download-storage.mjs into a Supabase project (DATA-002 restore drill).
//
//   node scripts/backup/upload-storage.mjs <backup-dir>/storage
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of the TARGET project.
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = process.argv[2];
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dir || !url || !key) {
  console.error("Usage: node scripts/backup/upload-storage.mjs <dir> (with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of the target)");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

async function* files(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}

let total = 0;
for (const bucket of await readdir(dir)) {
  const bucketDir = path.join(dir, bucket);
  for await (const file of files(bucketDir)) {
    const objectPath = path.relative(bucketDir, file).split(path.sep).join("/");
    const { error } = await admin.storage.from(bucket).upload(objectPath, await readFile(file), { upsert: true });
    if (error) throw new Error(`${bucket}/${objectPath}: ${error.message}`);
    total += 1;
  }
}
console.log(`Uploaded ${total} object(s)`);
