// @vitest-environment node
// COMP-001 / COMP-005: the Macedonian and English legal texts state the same
// facts, and those facts match the running system (migrations, code and
// docs/production). If a period or processor changes, this test fails until
// the privacy policy, terms and DPA are updated in both languages.
import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { LEGAL_LAST_UPDATED, LEGAL_VERSION, PLACEHOLDERS, PROCESSORS, RETENTION_FACTS, SECURITY_FACTS } from "@/lib/legal/facts";
import { privacy } from "@/lib/legal/privacy";
import { terms } from "@/lib/legal/terms";
import { dpa } from "@/lib/legal/dpa";
import { sectionText, type LegalDocument } from "@/lib/legal/types";
import { MIN_PASSWORD_LENGTH } from "@/lib/security/password";

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
      expect(d.lastUpdated).toBe("2026-11-18");
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

  it("the guest's shared-link remember token lasts the days the texts state (0179)", () => {
    expect(read("lib/couple/rsvp-remember.ts")).toContain(`REMEMBER_SECONDS = ${RETENTION_FACTS.rsvpRememberDays} * 24 * 60 * 60`);
    for (const d of [privacy.mk, privacy.en]) {
      const guests = sectionText(d.sections.find((s) => s.id === "guests")!);
      const cookies = sectionText(d.sections.find((s) => s.id === "cookies")!);
      expect(numbers(guests)).toContain(String(RETENTION_FACTS.rsvpRememberDays));
      expect(cookies).toContain("rsvp-remember");
    }
    for (const d of [dpa.mk, dpa.en]) expect(numbers(fullText(d))).toContain(String(RETENTION_FACTS.rsvpRememberDays));
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

  it("one minimum password length everywhere: app constant, manager SQL (0176), Supabase Auth and every schema", () => {
    expect(SECURITY_FACTS.minPasswordLength).toBe(MIN_PASSWORD_LENGTH);
    const managers = read("supabase/migrations/0176_password_min_and_ticket_retention.sql");
    expect(managers.match(new RegExp(`< ${MIN_PASSWORD_LENGTH} then`, "g"))).toHaveLength(2);
    expect(read("supabase/config.toml")).toContain(`minimum_password_length = ${MIN_PASSWORD_LENGTH}`);
    for (const file of [
      "lib/api/schemas.ts",
      "lib/admin/venue-actions-core.ts",
      "app/api/venue/settings/route.ts",
      "app/api/venue/managers/route.ts",
      "app/api/venue/managers/change-password/route.ts",
      "app/api/venue/first-login/route.ts",
      "app/reset-password/page.tsx",
      "components/admin/VenueAdminPanels.tsx",
      "components/venue/shell/AccountMenu.tsx",
      "components/venue/dashboard/ManagersSection.tsx",
      "components/venue/dashboard/SettingsClient.tsx",
      "components/venue/onboarding/FirstLoginPassword.tsx",
      "components/couple/guests/CoOrganizersPanel.tsx",
    ]) {
      const src = read(file);
      // (Settings' minLength={4} is the layout-lock PIN, not a password.)
      expect(src, file).not.toMatch(/најмалку \d+ знаци|minLength=\{(6|8|10)\}|\.min\((6|8|10)\b/);
    }
  });

  it("the scheduled retention sweep uses the periods the policy states (0170, 0178)", () => {
    const retentionDoc = read("docs/production/RETENTION.md");
    expect(retentionDoc).toContain(`**${RETENTION_FACTS.guestDataMonthsAfterEvent} months after \`event_date\`**`);
    expect(retentionDoc).toContain(`**${RETENTION_FACTS.contactMessagesMonths} months after receipt**`);
    // 0178: the sweep's current functions (one erasure per call).
    const sql = read("supabase/migrations/0178_retention_per_event_and_review_fixes.sql");
    const due = sql.slice(sql.indexOf("create or replace function public.due_retention_event_ids"));
    expect(due).toContain(`(event_date + interval '${RETENTION_FACTS.guestDataMonthsAfterEvent} months')`);
    const contacts = sql.slice(sql.indexOf("create or replace function public.purge_old_contact_submissions"));
    expect(contacts).toContain(`created_at < now() - interval '${RETENTION_FACTS.contactMessagesMonths} months'`);
    expect(read("lib/privacy/retention.ts")).toContain('rpc("due_retention_event_ids")');
    expect(read("lib/couple/access.ts")).toContain(`COUPLE_ACCESS_MONTHS = ${RETENTION_FACTS.guestDataMonthsAfterEvent};`);
    expect(read("vercel.json")).toContain('"/api/cron/retention"');
  });

  it("a cancelled event's access ends after the period the texts state (0170 trigger)", () => {
    const sql = read("supabase/migrations/0170_couple_access_lifecycle.sql");
    expect(sql).toContain(`(now() at time zone 'Europe/Skopje')::date + ${RETENTION_FACTS.cancelledEventAccessDays}\n`);
  });

  it("closed support tickets are deleted after the period the privacy policy states (0176, 0178)", () => {
    const sql = read("supabase/migrations/0178_retention_per_event_and_review_fixes.sql");
    const sweep = sql.slice(sql.indexOf("create or replace function public.purge_closed_support_tickets"));
    expect(sweep).toContain(`status = 'done' and resolved_at < now() - interval '${RETENTION_FACTS.supportTicketMonthsAfterClose} months'`);
    expect(read("docs/production/RETENTION.md")).toContain(`**${RETENTION_FACTS.supportTicketMonthsAfterClose} months after closing**`);
  });

  it("files whose record was deleted are gone within the stated hours (daily storage-cleanup cron)", () => {
    expect(RETENTION_FACTS.deletedFileHours).toBe(24);
    const crons = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
    const cleanup = crons.find((c) => c.path === "/api/cron/storage-cleanup");
    // A fixed minute and hour, every day: at most 24 hours between runs.
    expect(cleanup?.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it("an admin-closed venue is deleted after the export window the terms/DPA state (0172)", () => {
    expect(read("docs/production/RETENTION.md")).toContain(`**${RETENTION_FACTS.exportWindowAfterEndDays} days** after the admin schedules it`);
    expect(read("lib/admin/venue-actions-core.ts")).toContain("VENUE_DELETION_DELAY_DAYS = RETENTION_FACTS.exportWindowAfterEndDays;");
    expect(read("app/api/cron/retention/route.ts")).toContain("runScheduledVenueDeletions()");
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
        RETENTION_FACTS.cancelledEventAccessDays,
        RETENTION_FACTS.deletedFileHours,
        RETENTION_FACTS.exportWindowAfterEndDays,
        RETENTION_FACTS.offsiteBackupDays,
        RETENTION_FACTS.databaseBackupDays,
      ]) {
        expect(n).toContain(String(value));
      }
    }
  });

  it("the terms state the client-access period, the cancellation period and the export window", () => {
    for (const d of [terms.mk, terms.en]) {
      const n = numbers(fullText(d));
      for (const value of [
        RETENTION_FACTS.guestDataMonthsAfterEvent,
        RETENTION_FACTS.cancelledEventAccessDays,
        RETENTION_FACTS.exportWindowAfterEndDays,
      ]) {
        expect(n).toContain(String(value));
      }
    }
  });

  it("no text still describes self-signup or a proposed period", () => {
    for (const d of [privacy, terms, dpa].flatMap((doc) => [doc.mk, doc.en])) {
      expect(fullText(d)).not.toMatch(/регистрациј|регистрира сметка|регистрирал|sign-up|signing up|registers an account|предложен рок|proposed (period|retention)/i);
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
