// Copies every object of the app's storage buckets to a local directory, for
// the off-site backup (DATA-001). Supabase's own backups do not include
// Storage objects.
//
//   node scripts/backup/download-storage.mjs <out-dir>
//
// Needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = process.argv[2];
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!outDir || !url || !key) {
  console.error("Usage: node scripts/backup/download-storage.mjs <out-dir> (with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set)");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const BUCKETS = ["menu-item-photos", "event-showcase-photos", "invitation-photos"];

async function listAll(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const entry of data) {
      const p = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...(await listAll(bucket, p)));
      else if (entry.name !== ".emptyFolderPlaceholder") out.push(p);
    }
    if (data.length < 1000) return out;
  }
}

let total = 0;
for (const bucket of BUCKETS) {
  const objects = await listAll(bucket);
  for (const objectPath of objects) {
    const { data, error } = await admin.storage.from(bucket).download(objectPath);
    if (error) throw new Error(`${bucket}/${objectPath}: ${error.message}`);
    const target = path.join(outDir, bucket, objectPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await data.arrayBuffer()));
  }
  console.log(`${bucket}: ${objects.length} object(s)`);
  total += objects.length;
}
console.log(`Downloaded ${total} object(s) to ${outDir}`);
