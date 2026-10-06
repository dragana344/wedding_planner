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

export const LEGAL_LAST_UPDATED = "2026-09-29";
/** 1.1: revision after legal review 1 (docs/production/LEGAL-REVIEW.md). Stored on venues.terms_version at signup. */
export const LEGAL_VERSION = "1.1";

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

/** Unknowns. Identical in both languages; all must be filled before publishing. */
export const PLACEHOLDERS = {
  company: "[ПРАВНО ИМЕ НА ФИРМАТА / COMPANY LEGAL NAME]",
  address: "[АДРЕСА / ADDRESS]",
  regNo: "[ЕМБС / REGISTRATION NO.]",
  privacyEmail: "privacy@kadesi.mk",
  supportEmail: "support@kadesi.mk",
  domain: "kadesi.mk",
  dpo: "[ОФИЦЕР ЗА ЗАШТИТА НА ЛИЧНИТЕ ПОДАТОЦИ / DATA PROTECTION OFFICER]",
  auditLogRetention: "[РОК ЗА ЧУВАЊЕ НА РЕВИЗОРСКИОТ ДНЕВНИК / AUDIT LOG RETENTION]",
  serverLogRetention: "[РОК ЗА ЧУВАЊЕ НА СЕРВЕРСКИТЕ ЛОГОВИ / SERVER LOG RETENTION]",
  court: "[НАДЛЕЖЕН СУД / COMPETENT COURT]",
  noticePeriod: "[РОК ЗА НАЈАВА НА ИЗМЕНИ / NOTICE PERIOD]",
  prevailingLanguage: "[ЈАЗИК ШТО ПРЕОВЛАДУВА / PREVAILING LANGUAGE]",
  reservationRetention: "[РОК ЗА ЧУВАЊЕ НА РЕЗЕРВАЦИИТЕ / RESERVATION RETENTION]",
  formerStaffRetention: "[РОК ЗА СМЕТКИ НА ПОРАНЕШНИ ВРАБОТЕНИ / FORMER STAFF ACCOUNT RETENTION]",
  teamMailProvider: "[ДАВАТЕЛ НА Е-ПОШТАТА НА ТИМОТ / TEAM EMAIL PROVIDER]",
  githubRunnerLocation: "[ЛОКАЦИЈА НА GITHUB RUNNERS / GITHUB RUNNER LOCATION]",
  azlpAddress: "[ПОШТЕНСКА АДРЕСА НА АЗЛП / AZLP POSTAL ADDRESS]",
  // DPA only
  subprocessorNotice: "[РОК ЗА НАЈАВА ЗА ПОДОБРАБОТУВАЧИ / SUB-PROCESSOR NOTICE PERIOD]",
  auditNotice: "[РОК ЗА НАЈАВА НА РЕВИЗИЈА / AUDIT NOTICE PERIOD]",
  companySignatory: "[ПОТПИСНИК НА ФИРМАТА / COMPANY SIGNATORY]",
  venueSignatory: "[ПОТПИСНИК НА ЛОКАЛОТ / VENUE SIGNATORY]",
  signatureDate: "[ДАТУМ / DATE]",
} as const;
