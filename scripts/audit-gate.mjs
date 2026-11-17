// SEC-011: fail CI on high/critical vulnerabilities in production
// dependencies, except advisories listed in audit-allowlist.json, each with a
// reason and an expiry date. An expired entry fails the gate again, so a
// temporary exception cannot be forgotten.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);

/** Advisory id (GHSA-…) from an advisory url. */
function advisoryId(url) {
  return /GHSA-[\w-]+/i.exec(url ?? "")?.[0] ?? url;
}

/**
 * @param {{ vulnerabilities?: Record<string, { via?: unknown[] }> }} audit parsed `npm audit --json` output
 * @param {Record<string, { reason: string, until: string }>} allowlist keyed by GHSA id
 * @param {string} today YYYY-MM-DD
 */
export function evaluateAudit(audit, allowlist, today) {
  const advisories = new Map();
  for (const vuln of Object.values(audit.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via === "object" && via !== null && BLOCKING.has(via.severity)) advisories.set(advisoryId(via.url), via);
    }
  }
  const exceptions = new Map(Object.entries(allowlist).map(([id, entry]) => [id.toLowerCase(), entry]));
  const blocked = [];
  const allowed = [];
  for (const [id, via] of advisories) {
    const entry = exceptions.get(id.toLowerCase());
    if (!entry) blocked.push({ id, title: via.title, why: "no exception on file" });
    else if (entry.until < today) blocked.push({ id, title: via.title, why: `exception expired on ${entry.until}` });
    else allowed.push({ id, title: via.title, until: entry.until, reason: entry.reason });
  }
  return { blocked, allowed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const allowlist = JSON.parse(readFileSync(new URL("../audit-allowlist.json", import.meta.url), "utf8"));
  // npm audit exits non-zero whenever it finds anything; the JSON is what matters.
  const run = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let audit;
  try {
    audit = JSON.parse(run.stdout);
  } catch {
    console.error("Could not read `npm audit` output:", run.stderr || run.stdout);
    process.exit(1);
  }
  if (audit.error) {
    console.error("npm audit failed:", audit.error.summary ?? audit.error);
    process.exit(1);
  }
  const { blocked, allowed } = evaluateAudit(audit, allowlist, new Date().toISOString().slice(0, 10));
  for (const a of allowed) console.log(`allowed until ${a.until}: ${a.id} - ${a.title}\n  ${a.reason}`);
  for (const b of blocked) console.error(`BLOCKED: ${b.id} - ${b.title} (${b.why})`);
  if (blocked.length > 0) process.exit(1);
  console.log(`Dependency audit ok (${allowed.length} documented exception${allowed.length === 1 ? "" : "s"}).`);
}
