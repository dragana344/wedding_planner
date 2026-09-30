// PERF-003: client JS size baseline from a production build (.next).
//   npm run build && node scripts/bundle-report.mjs [--markdown]
// For an interactive per-module view: `npx next experimental-analyze`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const dir = ".next/static/chunks";
function walk(d) {
  return readdirSync(d).flatMap((name) => {
    const p = path.join(d, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
  });
}

let files;
try {
  files = walk(dir);
} catch {
  console.error("No .next/static/chunks — run `npm run build` first.");
  process.exit(1);
}

const rows = files
  .map((file) => {
    const buf = readFileSync(file);
    return { file: path.relative(dir, file), raw: buf.length, gzip: gzipSync(buf).length };
  })
  .sort((a, b) => b.gzip - a.gzip);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const total = rows.reduce((t, r) => ({ raw: t.raw + r.raw, gzip: t.gzip + r.gzip }), { raw: 0, gzip: 0 });

if (process.argv.includes("--markdown")) {
  console.log(`| Chunk | Raw | Gzip |\n|---|---|---|`);
  for (const r of rows.slice(0, 15)) console.log(`| \`${r.file}\` | ${kb(r.raw)} | ${kb(r.gzip)} |`);
  console.log(`| **All ${rows.length} chunks** | **${kb(total.raw)}** | **${kb(total.gzip)}** |`);
} else {
  for (const r of rows.slice(0, 15)) console.log(`${kb(r.gzip).padStart(10)}  ${r.file}`);
  console.log(`${kb(total.gzip).padStart(10)}  total gzip (${rows.length} chunks, ${kb(total.raw)} raw)`);
}
