// Facts the privacy policy, terms and DPA (COMP-001, COMP-005) state. Each one
// must match the running system; tests/lib/pure/legal-parity.test.ts checks
// them against the migrations and docs/production.
//
// Sources: docs/production/DATA-MAP.md (processors), RETENTION.md (periods),
// BACKUPS.md (backup windows), COOKIES.md (cookies), HOSTING.md (regions).
//
// TO CONFIRM BY LEGAL REVIEW (docs/production/LEGAL-REVIEW.md): the roles
// (venue = controller for its clients' and guests' data, platform = processor;
// platform = controller for venue staff accounts, contact-form and demo-request
// messages, venue support tickets and security logs). Every period below is
// live (version 1.3 change list: LEGAL-REVIEW.md).

import { MIN_PASSWORD_LENGTH } from "../security/password";

export const LEGAL_LAST_UPDATED = "2026-11-18";
/**
 * 1.1: revision after legal review 1 (docs/production/LEGAL-REVIEW.md).
 * 1.2: operated by GoDevLab Agency until the company is registered; open blanks removed.
 * 1.3: couple access life cycle and automatic erasure live, album/greetings/support/demo
 *      requests described, scheduled venue deletion, terms accepted at first login.
 * Stored on venues.terms_version when the owner accepts on first login (POST /api/venue/terms);
 * a new version shows the terms screen to every venue again (lib/venue/onboarding.ts).
 */
export const LEGAL_VERSION = "1.3";

export const RETENTION_FACTS = {
  /** LIVE: daily cron /api/cron/retention → due_retention_event_ids() + erase_event_personal_data() per event (0170, 0178); admin can extend per event. */
  guestDataMonthsAfterEvent: 6,
  /** LIVE: same cron and function (0170); contact-form and demo-request messages. */
  contactMessagesMonths: 6,
  /** LIVE: couple access ends this many days after a cancellation, unless the normal end is earlier
   * (0170 trigger events_couple_access_on_status); the data is erased the day after. */
  cancelledEventAccessDays: 30,
  /** LIVE: closed support tickets are deleted this long after closing (0176, same cron). */
  supportTicketMonthsAfterClose: 6,
  /** LIVE: files whose record was deleted are removed by the daily /api/cron/storage-cleanup (0038)
   * at the latest; usually at once. */
  deletedFileHours: 24,
  /** Live: lib/couple/session-verify.ts SESSION_DURATION_MS. */
  coupleSessionDays: 30,
  /** Live: lib/couple/rsvp-remember.ts REMEMBER_SECONDS — the shared-link "remember me" token a guest's browser keeps (localStorage, 0179). */
  rsvpRememberDays: 180,
  /** Live: pg_cron job in migration 0037. */
  rateLimitCounterDays: 1,
  /** Supabase managed backups (BACKUPS.md). */
  databaseBackupDays: 7,
  /** Off-site archives in Cloudflare R2 (BACKUPS.md lifecycle rule). */
  offsiteBackupDays: 35,
  /** DPA / Terms (R1-10): when we close a venue account, its deletion is scheduled this many days
   * later so the venue can export its data (0172, VENUE_DELETION_DELAY_DAYS). LIVE. */
  exportWindowAfterEndDays: 15,
} as const;

export const SECURITY_FACTS = {
  /** verify_event_credentials: lockout after this many failures… */
  coupleLoginMaxAttempts: 5,
  /** …for this many minutes. */
  coupleLockoutMinutes: 15,
  /** Minimum password length for every password (lib/security/password.ts; 0034, 0176, config.toml). */
  minPasswordLength: MIN_PASSWORD_LENGTH,
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
