// Facts the privacy policy, terms and DPA (COMP-001, COMP-005) state. Each one
// must match the running system; tests/lib/pure/legal-parity.test.ts checks
// them against the migrations and docs/production.
//
// Sources: docs/production/DATA-MAP.md (processors), RETENTION.md (periods),
// BACKUPS.md (backup windows), COOKIES.md (cookies), HOSTING.md (regions).
//
// TO CONFIRM BY LEGAL REVIEW (docs/production/LEGAL-REVIEW.md): the roles
// (venue = controller for its clients' and guests' data, platform = processor;
// platform = controller for venue staff accounts, contact-form messages and
// security logs), and the two PROPOSED periods below, which are not scheduled
// yet (DATA-007).

export const LEGAL_LAST_UPDATED = "2026-10-06";
/**
 * 1.1: revision after legal review 1 (docs/production/LEGAL-REVIEW.md).
 * 1.2: operated by GoDevLab Agency until the company is registered; open blanks removed.
 * Stored on venues.terms_version at signup.
 */
export const LEGAL_VERSION = "1.2";

export const RETENTION_FACTS = {
  /** PROPOSED, not scheduled yet: purge_expired_personal_data(12, …). */
  guestDataMonthsAfterEvent: 12,
  /** PROPOSED, not scheduled yet: purge_expired_personal_data(…, 24). */
  contactMessagesMonths: 24,
  /** Live: lib/couple/session-verify.ts SESSION_DURATION_MS. */
  coupleSessionDays: 30,
  /** Live: pg_cron job in migration 0037. */
  rateLimitCounterDays: 1,
  /** Supabase managed backups (BACKUPS.md). */
  databaseBackupDays: 7,
  /** Off-site archives in Cloudflare R2 (BACKUPS.md lifecycle rule). */
  offsiteBackupDays: 35,
  /** DPA / Terms default (R1-10): export window after the service ends, then deletion. */
  exportWindowAfterEndDays: 30,
} as const;

export const SECURITY_FACTS = {
  /** verify_event_credentials: lockout after this many failures… */
  coupleLoginMaxAttempts: 5,
  /** …for this many minutes. */
  coupleLockoutMinutes: 15,
  /** Minimum password length (AUTH.md, migration 0034). */
  minPasswordLength: 10,
  /** DPA: target for notifying the venue of a personal-data breach. */
  breachNotificationHours: 48,
} as const;

export type ProcessorStatus = "live" | "planned" | "if-enabled";

/**
 * Sub-processors, in the order of DATA-MAP section 7 (Upstash is not used:
 * rate limits live in Postgres). GitHub runs the nightly backup job
 * (.github/workflows/backup.yml) on GitHub-hosted runners, together with R2.
 */
export const PROCESSORS = [
  { name: "Supabase", status: "live" },
  { name: "Vercel", status: "live" },
  { name: "Resend", status: "planned" },
  { name: "Sentry", status: "if-enabled" },
  { name: "Cloudflare R2", status: "planned" },
  { name: "GitHub", status: "planned" },
] as const satisfies readonly { name: string; status: ProcessorStatus }[];

/**
 * Values the documents quote. The platform is run by GoDevLab Agency until
 * its own company is registered; name, seat and registration number go into
 * the "who we are" sentences then (privacy.ts, terms.ts, dpa.ts).
 */
export const PLACEHOLDERS = {
  company: "GoDevLab Agency (godevlabagency.com)",
  privacyEmail: "support@kadesi.mk",
  supportEmail: "support@kadesi.mk",
  domain: "kadesi.mk",
} as const;
