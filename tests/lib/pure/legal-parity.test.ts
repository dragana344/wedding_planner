// @vitest-environment node
// COMP-001 / COMP-005: the Macedonian and English legal texts state the same
// facts, and those facts match the running system (migrations, code and
// docs/production). If a period or processor changes, this test fails until
// the privacy policy, terms and DPA are updated in both languages.
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { LEGAL_LAST_UPDATED, LEGAL_VERSION, PLACEHOLDERS, PROCESSORS, RETENTION_FACTS, SECURITY_FACTS } from "@/lib/legal/facts";
import { privacy } from "@/lib/legal/privacy";
import { terms } from "@/lib/legal/terms";
import { dpa } from "@/lib/legal/dpa";
import { sectionText, type LegalDocument } from "@/lib/legal/types";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const numbers = (text: string) => (text.match(/\d+(?:[./]\d+)*/g) ?? []).sort();
const placeholders = (text: string) => [...new Set(text.match(/\[[^\]]+ \/ [^\]]+\]/g) ?? [])].sort();
const fullText = (doc: LegalDocument) => [doc.title, ...doc.intro, ...doc.sections.map(sectionText)].join("\n");

const docs = { privacy, terms, dpa };

describe.each(Object.entries(docs))("%s: MK and EN parity", (_name, doc) => {
  it("has the same sections in the same order, with the same block shapes", () => {
    expect(doc.mk.sections.length).toBe(doc.en.sections.length);
    expect(doc.mk.sections.map((s) => s.id)).toEqual(doc.en.sections.map((s) => s.id));
    const shape = (d: LegalDocument) =>
      d.sections.map((s) => s.blocks.map((b) => (b.type === "p" ? "p" : b.type === "ul" ? `ul${b.items.length}` : `t${b.rows.length}x${b.head.length}`)));
    expect(shape(doc.mk)).toEqual(shape(doc.en));
  });

  it("states the same numbers in every section (periods, counts, law references)", () => {
    expect(numbers(doc.mk.intro.join("\n"))).toEqual(numbers(doc.en.intro.join("\n")));
    doc.mk.sections.forEach((s, i) => {
      expect({ id: s.id, n: numbers(sectionText(s)) }).toEqual({ id: s.id, n: numbers(sectionText(doc.en.sections[i])) });
    });
  });

  it("uses identical placeholders in both languages, all from the known list", () => {
    const mk = placeholders(fullText(doc.mk));
    expect(mk).toEqual(placeholders(fullText(doc.en)));
    const known = new Set<string>(Object.values(PLACEHOLDERS));
    expect(mk.filter((p) => !known.has(p))).toEqual([]);
  });

  it("carries the version and date", () => {
    for (const d of [doc.mk, doc.en]) {
      expect(d.lastUpdated).toBe("2026-09-29");
      expect(d.lastUpdated).toBe(LEGAL_LAST_UPDATED);
      expect(d.version).toBe(LEGAL_VERSION);
    }
  });
});

const processorTable = (d: LegalDocument, sectionId: string) => {
  const table = d.sections.find((s) => s.id === sectionId)!.blocks.find((b) => b.type === "table");
  if (table?.type !== "table") throw new Error(`no table in ${sectionId}`);
  return table;
};

describe("privacy policy facts", () => {
  const processorNames = PROCESSORS.map((p) => p.name);

  it("lists the same processors in both languages and in the DPA, in the data-map order", () => {
    for (const [d, id] of [[privacy.mk, "processors"], [privacy.en, "processors"], [dpa.mk, "subprocessors"], [dpa.en, "subprocessors"]] as const) {
      expect(processorTable(d, id).rows.map((r) => r[0])).toEqual(processorNames);
    }
  });

  it("marks planned and optional processors as such", () => {
    for (const [d, id] of [[privacy.en, "processors"], [dpa.en, "subprocessors"]] as const) {
      const table = processorTable(d, id);
      for (const p of PROCESSORS) {
        const status = table.rows.find((r) => r[0] === p.name)![4];
        if (p.status === "live") expect(status).toBe("Active");
        if (p.status === "planned") expect(status).toBe("Planned");
        if (p.status === "if-enabled") expect(status).toMatch(/only if enabled/);
      }
    }
  });

  it("states every retention period in both languages", () => {
    const retention = (d: LegalDocument) => sectionText(d.sections.find((s) => s.id === "retention")!);
    for (const d of [privacy.mk, privacy.en]) {
      const n = numbers(retention(d));
      for (const value of Object.values(RETENTION_FACTS)) expect(n).toContain(String(value));
    }
  });

  it("names exactly the processors in DATA-MAP section 7 (no Upstash: rate limits are in Postgres)", () => {
    const dataMap = read("docs/production/DATA-MAP.md");
    const section7 = dataMap.slice(dataMap.indexOf("## 7. Processors"), dataMap.indexOf("## 8."));
    for (const name of processorNames) expect(section7).toContain(`**${name}**`);
    const rateLimits = read("supabase/migrations/0037_rate_limits.sql");
    expect(rateLimits).toMatch(/Kept in Postgres/);
    expect(read("lib/security/rate-limit.ts")).not.toMatch(/upstash|KV_REST_API/i);
  });
});

describe("stated facts match the system", () => {
  it("couple sessions last 30 days (sliding)", () => {
    expect(read("lib/couple/session-verify.ts")).toContain(`SESSION_DURATION_MS = ${RETENTION_FACTS.coupleSessionDays} * DAY_MS`);
  });

  it("rate-limit windows are purged after 1 day and subjects are hashed", () => {
    expect(RETENTION_FACTS.rateLimitCounterDays).toBe(1);
    expect(read("supabase/migrations/0037_rate_limits.sql")).toContain("window_start < now() - interval '1 day'");
    expect(read("lib/security/rate-limit.ts")).toContain('pseudonymize("rate-limit"');
    expect(read("lib/security/pseudonym.ts")).toContain('createHmac("sha256"');
  });

  it("backup windows match BACKUPS.md", () => {
    const backups = read("docs/production/BACKUPS.md");
    expect(backups).toContain(`${RETENTION_FACTS.databaseBackupDays} days on Pro`);
    expect(backups).toContain(`${RETENTION_FACTS.offsiteBackupDays} days (R2 lifecycle rule)`);
  });

  it("couple login lockout and password minimum match the migrations", () => {
    expect(read("supabase/migrations/0013_couple_dashboard.sql")).toContain(
      `failed_attempts + 1 >= ${SECURITY_FACTS.coupleLoginMaxAttempts} then now() + interval '${SECURITY_FACTS.coupleLockoutMinutes} minutes'`,
    );
    expect(read("supabase/migrations/0034_couple_credentials_policy.sql")).toContain(`< ${SECURITY_FACTS.minPasswordLength} then`);
  });

  it("the retention sweep, once scheduled, uses the periods the policy states", () => {
    // Until DATA-007 schedules it, the 12/24-month periods are only proposals
    // and the policy must not be published (docs/production/LEGAL-REVIEW.md).
    const retentionDoc = read("docs/production/RETENTION.md");
    expect(retentionDoc).toContain(`**${RETENTION_FACTS.guestDataMonthsAfterEvent} months after \`event_date\`**`);
    expect(retentionDoc).toContain(`**${RETENTION_FACTS.contactMessagesMonths} months after receipt**`);
    const dir = path.join(root, "supabase/migrations");
    for (const file of readdirSync(dir)) {
      const sql = readFileSync(path.join(dir, file), "utf8");
      const scheduled = sql.match(/cron\.schedule\(\s*'purge-expired-personal-data'[\s\S]*?purge_expired_personal_data\((\d+),\s*(\d+)\)/);
      if (scheduled) {
        expect([Number(scheduled[1]), Number(scheduled[2])]).toEqual([RETENTION_FACTS.guestDataMonthsAfterEvent, RETENTION_FACTS.contactMessagesMonths]);
      }
    }
  });
});

describe("DPA (COMP-005)", () => {
  it("states the breach deadline, the default erasure period, the export window and the backup window", () => {
    for (const d of [dpa.mk, dpa.en]) {
      const text = fullText(d);
      const n = numbers(text);
      for (const value of [
        SECURITY_FACTS.breachNotificationHours,
        RETENTION_FACTS.guestDataMonthsAfterEvent,
        RETENTION_FACTS.exportWindowAfterEndDays,
        RETENTION_FACTS.offsiteBackupDays,
        RETENTION_FACTS.databaseBackupDays,
      ]) {
        expect(n).toContain(String(value));
      }
    }
  });

  it("the repository copies point at the published pages", () => {
    expect(read("docs/legal/DPA.md")).toContain("lib/legal/dpa.ts");
    expect(read("docs/legal/DPA.en.md")).toContain("lib/legal/dpa.ts");
  });

  it("GitHub (backup runners) is a listed sub-processor and the backup job runs there", () => {
    expect(PROCESSORS.map((p) => p.name)).toContain("GitHub");
    expect(read(".github/workflows/backup.yml")).toMatch(/runs-on:/);
  });
});
