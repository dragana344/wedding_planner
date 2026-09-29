# Production-readiness task index

Execute top to bottom. Order is a valid topological sort of `depends_on` (checked by the generator: no cycles, no task depends on a lower-priority task). 
`⚑` = requires approval before starting (touches logic or frontend, or needs a product/legal decision).

## Phase 1 - P0: blocks launch

| # | Task | Category | Effort | Depends on | |
|---|---|---|---|---|---|
| 1 | [x] [ARCH-001](tasks/ARCH-001-one-shared-api-route-wrapper-auth-context-json-parsing-error.md) One shared API route wrapper (auth context, JSON parsing, errors) | architecture | M | - |  |
| 2 | [x] [COMP-003](tasks/COMP-003-data-map-and-processor-inventory.md) Data map and processor inventory | compliance | S | - |  |
| 3 | [ ] [COMP-001](tasks/COMP-001-privacy-policy-and-terms-of-service.md) Privacy policy and terms of service | compliance | M | COMP-003 | ⚑ |
| 4 | [x] [DATA-008](tasks/DATA-008-tests-must-never-run-against-a-non-local-database.md) Tests must never run against a non-local database | data | S | - |  |
| 5 | [ ] [INFRA-001](tasks/INFRA-001-decide-and-document-the-production-hosting-target.md) Decide and document the production hosting target | infra | S | - |  |
| 6 | [ ] [DATA-001](tasks/DATA-001-automated-backups-for-database-and-storage.md) Automated backups for database and storage | data | M | INFRA-001 |  |
| 7 | [ ] [INFRA-002](tasks/INFRA-002-domain-tls-and-canonical-host.md) Domain, TLS and canonical host | infra | S | INFRA-001 |  |
| 8 | [ ] [INFRA-003](tasks/INFRA-003-secrets-management-and-key-hygiene.md) Secrets management and key hygiene | infra | S | INFRA-001 |  |
| 9 | [ ] [INFRA-006](tasks/INFRA-006-production-email-custom-smtp-for-supabase-auth-plus-spf-dkim.md) Production email: custom SMTP for Supabase Auth plus SPF/DKIM/DMARC | infra | M | INFRA-002 |  |
| 10 | [ ] [INFRA-007](tasks/INFRA-007-vercel-plan-for-commercial-use-and-region-placement.md) Vercel plan for commercial use and region placement | infra | S | INFRA-001 |  |
| 11 | [ ] [REL-002](tasks/REL-002-environment-separation-and-env-validation-at-boot.md) Environment separation and env validation at boot | reliability | M | INFRA-001 |  |
| 12 | [ ] [OBS-001](tasks/OBS-001-error-tracking-sentry-for-server-edge-and-browser.md) Error tracking (Sentry) for server, edge and browser | observability | M | REL-002 |  |
| 13 | [x] [SEC-001](tasks/SEC-001-security-headers-and-content-security-policy.md) Security headers and Content-Security-Policy | security | M | - |  |
| 14 | [x] [SEC-002](tasks/SEC-002-rate-limiting-on-public-and-credential-endpoints.md) Rate limiting on public and credential endpoints | security | M | INFRA-001 |  |
| 15 | [x] [SEC-004](tasks/SEC-004-input-validation-on-every-api-route-and-a-postgrest-filter-i.md) Input validation on every API route (and a PostgREST filter-injection fix) | security | M | ARCH-001 |  |
| 16 | [x] [SEC-005](tasks/SEC-005-invitation-photo-upload-any-image-any-size-the-platform-allo.md) Invitation photo upload: any image, any size the platform allows, safely | security | M | - | ⚑ |
| 17 | [ ] [SEC-012](tasks/SEC-012-production-supabase-auth-settings.md) Production Supabase Auth settings | security | S | INFRA-002, INFRA-006 | ⚑ |
| 18 | [ ] [AUTH-002](tasks/AUTH-002-password-reset-works-end-to-end-in-production.md) Password reset works end to end in production | auth | S | SEC-012, INFRA-006 |  |
| 19 | [x] [TEST-001](tasks/TEST-001-split-unit-and-database-tests-make-both-runnable-from-script.md) Split unit and database tests; make both runnable from scripts | testing | M | DATA-008 |  |
| 20 | [x] [SEC-019](tasks/SEC-019-storage-update-policy-must-check-the-destination-folder.md) Storage update policy must check the destination folder | security | S | TEST-001 |  |
| 21 | [x] [SEC-020](tasks/SEC-020-stop-anonymous-listing-of-the-public-storage-buckets.md) Stop anonymous listing of the public storage buckets | security | S | TEST-001 |  |
| 22 | [x] [TEST-002](tasks/TEST-002-cross-event-authorization-tests-for-every-couple-api-route.md) Cross-event authorization tests for every couple API route | testing | M | TEST-001 |  |
| 23 | [ ] [TEST-004](tasks/TEST-004-lint-and-type-check-as-gates.md) Lint and type-check as gates | testing | S | - |  |
| 24 | [ ] [CICD-001](tasks/CICD-001-ci-pipeline-install-lint-typecheck-unit-tests-build.md) CI pipeline: install, lint, typecheck, unit tests, build | ci-cd | M | TEST-001, TEST-004 |  |
| 25 | [ ] [DATA-003](tasks/DATA-003-migration-discipline-applied-by-pipeline-drift-checked.md) Migration discipline: applied by pipeline, drift-checked | data | S | CICD-001, INFRA-001 |  |
| 26 | [ ] [CICD-003](tasks/CICD-003-deployment-pipeline-previews-gated-production-migrations-fir.md) Deployment pipeline: previews, gated production, migrations first | ci-cd | M | CICD-001, DATA-003, REL-002 |  |
| 27 | [x] [SEC-024](tasks/SEC-024-upgrade-next-js-off-the-vulnerable-14-2-line.md) Upgrade Next.js off the vulnerable 14.2 line | security | L | TEST-001, CICD-001 | ⚑ |

## Phase 2 - P1: needed before real users

| # | Task | Category | Effort | Depends on | |
|---|---|---|---|---|---|
| 28 | [x] [ARCH-003](tasks/ARCH-003-decide-what-to-do-with-the-placeholder-pages-at-launch.md) Decide what to do with the placeholder pages at launch | architecture | S | - | ⚑ |
| 29 | [x] [AUTH-001](tasks/AUTH-001-supabase-session-refresh-in-middleware-for-the-venue-panel.md) Supabase session refresh in middleware for the venue panel | auth | S | - |  |
| 30 | [ ] [CICD-004](tasks/CICD-004-rollback-runbook.md) Rollback runbook | ci-cd | S | CICD-003 |  |
| 31 | [ ] [CICD-006](tasks/CICD-006-protect-the-main-branch.md) Protect the main branch | ci-cd | S | CICD-001 |  |
| 32 | [x] [COMP-004](tasks/COMP-004-keep-private-pages-out-of-search-engines.md) Keep private pages out of search engines | compliance | S | - |  |
| 33 | [ ] [COMP-005](tasks/COMP-005-data-processing-terms-with-venues-b2b.md) Data processing terms with venues (B2B) | compliance | M | COMP-001 | ⚑ |
| 34 | [ ] [DATA-002](tasks/DATA-002-restore-drill.md) Restore drill | data | M | DATA-001 |  |
| 35 | [x] [DATA-005](tasks/DATA-005-personal-data-export-and-erasure-server-side.md) Personal data export and erasure (server side) | data | L | TEST-001 | ⚑ |
| 36 | [x] [DATA-006](tasks/DATA-006-export-and-delete-entry-points-for-venues-and-couples.md) Export and delete entry points for venues and couples | data | M | DATA-005 | ⚑ |
| 37 | [ ] [DATA-007](tasks/DATA-007-retention-and-cleanup-jobs.md) Retention and cleanup jobs | data | M | DATA-005 | ⚑ |
| 38 | [x] [DATA-009](tasks/DATA-009-database-level-limits-and-constraints.md) Database-level limits and constraints | data | M | SEC-004 |  |
| 39 | [x] [DATA-010](tasks/DATA-010-never-copy-production-personal-data-into-staging-or-laptops.md) Never copy production personal data into staging or laptops | data | S | REL-002 |  |
| 40 | [x] [DATA-011](tasks/DATA-011-delete-files-when-their-rows-are-deleted.md) Delete files when their rows are deleted | data | M | TEST-001 |  |
| 41 | [x] [DATA-012](tasks/DATA-012-database-level-protection-against-double-booking.md) Database-level protection against double booking | data | M | TEST-001 |  |
| 42 | [ ] [INFRA-004](tasks/INFRA-004-readme-node-version-pin-and-lockfile-policy.md) README, Node version pin and lockfile policy | infra | S | - |  |
| 43 | [ ] [INFRA-008](tasks/INFRA-008-auth-emails-in-macedonian-from-the-product-s-own-sender.md) Auth emails in Macedonian from the product's own sender | infra | S | INFRA-006 | ⚑ |
| 44 | [x] [OBS-002](tasks/OBS-002-structured-server-logging-with-request-ids-and-pii-hygiene.md) Structured server logging with request ids and PII hygiene | observability | M | ARCH-001 |  |
| 45 | [ ] [OBS-005](tasks/OBS-005-deliver-contact-form-submissions-to-the-team.md) Deliver contact-form submissions to the team | observability | S | INFRA-006, SEC-002 |  |
| 46 | [x] [REL-001](tasks/REL-001-health-endpoint-with-release-id.md) Health endpoint with release id | reliability | S | - |  |
| 47 | [ ] [OBS-003](tasks/OBS-003-uptime-checks-and-alerting.md) Uptime checks and alerting | observability | S | REL-001, DATA-001 |  |
| 48 | [ ] [OBS-006](tasks/OBS-006-incident-response-runbook-and-on-call.md) Incident response runbook and on-call | observability | S | OBS-003, CICD-004 |  |
| 49 | [ ] [REL-003](tasks/REL-003-error-not-found-and-global-error-boundaries.md) Error, not-found and global-error boundaries | reliability | S | OBS-001 | ⚑ |
| 50 | [x] [REL-006](tasks/REL-006-use-the-venue-s-local-date-not-utc-for-today.md) Use the venue's local date, not UTC, for 'today' | reliability | S | TEST-001 | ⚑ |
| 51 | [x] [SEC-003](tasks/SEC-003-stop-returning-raw-database-internal-error-text-from-api-rou.md) Stop returning raw database/internal error text from API routes | security | M | ARCH-001 | ⚑ |
| 52 | [x] [SEC-006](tasks/SEC-006-harden-security-definer-functions-and-function-grants.md) Harden SECURITY DEFINER functions and function grants | security | S | TEST-001 |  |
| 53 | [ ] [SEC-007](tasks/SEC-007-rls-guard-every-table-decided-advisors-clean.md) RLS guard: every table decided, advisors clean | security | M | TEST-001 |  |
| 54 | [x] [SEC-008](tasks/SEC-008-couple-sessions-hash-tokens-at-rest-and-throttle-renewal-wri.md) Couple sessions: hash tokens at rest and throttle renewal writes | security | M | TEST-001 |  |
| 55 | [x] [SEC-009](tasks/SEC-009-revoke-couple-sessions-when-the-event-password-is-regenerate.md) Revoke couple sessions when the event password is regenerated | security | S | SEC-008 | ⚑ |
| 56 | [x] [SEC-010](tasks/SEC-010-remove-the-shared-default-floor-plan-lock-password-0000.md) Remove the shared default floor-plan lock password '0000' | security | S | - | ⚑ |
| 57 | [ ] [SEC-011](tasks/SEC-011-dependency-and-secret-scanning-in-ci.md) Dependency and secret scanning in CI | security | S | CICD-001 |  |
| 58 | [x] [SEC-014](tasks/SEC-014-keep-server-only-code-out-of-client-bundles.md) Keep server-only code out of client bundles | security | S | - |  |
| 59 | [x] [SEC-015](tasks/SEC-015-csrf-defence-for-cookie-authenticated-mutations.md) CSRF defence for cookie-authenticated mutations | security | S | - |  |
| 60 | [x] [SEC-016](tasks/SEC-016-mfa-totp-for-venue-staff.md) MFA (TOTP) for venue staff | security | M | SEC-012 | ⚑ |
| 61 | [x] [SEC-017](tasks/SEC-017-sign-out-everywhere-for-venue-staff.md) Sign out everywhere for venue staff | security | S | AUTH-001 | ⚑ |
| 62 | [x] [SEC-018](tasks/SEC-018-persistent-audit-log-for-sensitive-actions.md) Persistent audit log for sensitive actions | security | M | OBS-002 |  |
| 63 | [x] [SEC-021](tasks/SEC-021-protect-guests-rsvp-answers-from-being-changed-by-other-gues.md) Protect guests' RSVP answers from being changed by other guests | security | M | SEC-018 | ⚑ |
| 64 | [x] [SEC-023](tasks/SEC-023-revoke-table-privileges-from-the-anon-role.md) Revoke table privileges from the anon role | security | S | TEST-001 |  |
| 65 | [ ] [SEC-025](tasks/SEC-025-pre-launch-security-review.md) Pre-launch security review | security | M | SEC-001, SEC-002, SEC-004, SEC-005, SEC-019, SEC-020, TEST-002 |  |
| 66 | [x] [SEC-027](tasks/SEC-027-minimum-strength-for-couple-passwords.md) Minimum strength for couple passwords | security | S | SEC-006 | ⚑ |
| 67 | [x] [SEC-028](tasks/SEC-028-type-and-size-limits-on-the-venue-photo-buckets.md) Type and size limits on the venue photo buckets | security | S | SEC-005 | ⚑ |
| 68 | [x] [TEST-003](tasks/TEST-003-venue-rls-isolation-tests-across-all-venue-tables.md) Venue RLS isolation tests across all venue tables | testing | M | TEST-001 |  |
| 69 | [ ] [CICD-002](tasks/CICD-002-ci-database-job-migrations-from-scratch-plus-db-tests.md) CI database job: migrations from scratch plus DB tests | ci-cd | M | CICD-001, TEST-002, TEST-003 |  |
| 70 | [x] [TEST-005](tasks/TEST-005-end-to-end-smoke-tests-for-the-critical-flows.md) End-to-end smoke tests for the critical flows | testing | M | TEST-001, CICD-001 |  |
| 71 | [ ] [TEST-008](tasks/TEST-008-load-test-before-launch.md) Load test before launch | testing | M | CICD-003, INFRA-007 |  |

## Phase 3 - P2: hardening after launch

| # | Task | Category | Effort | Depends on | |
|---|---|---|---|---|---|
| 72 | [x] [ARCH-002](tasks/ARCH-002-remove-the-unused-organizer-feature-from-the-schema.md) Remove the unused organizer feature from the schema | architecture | S | TEST-001 |  |
| 73 | [ ] [CICD-005](tasks/CICD-005-release-traceability.md) Release traceability | ci-cd | S | REL-001, OBS-001, CICD-003 |  |
| 74 | [x] [COMP-002](tasks/COMP-002-cookie-inventory-and-consent-decision.md) Cookie inventory and consent decision | compliance | S | COMP-003 |  |
| 75 | [x] [DATA-004](tasks/DATA-004-index-review-for-hot-paths.md) Index review for hot paths | data | S | TEST-001 |  |
| 76 | [ ] [OBS-004](tasks/OBS-004-third-party-quota-and-cost-monitoring.md) Third-party quota and cost monitoring | observability | S | INFRA-001 |  |
| 77 | [ ] [OBS-007](tasks/OBS-007-product-analytics-with-consent.md) Product analytics with consent | observability | M | COMP-002 | ⚑ |
| 78 | [x] [PERF-001](tasks/PERF-001-caching-and-image-delivery-config.md) Caching and image delivery config | performance | S | INFRA-001, SEC-024 |  |
| 79 | [x] [PERF-002](tasks/PERF-002-bounded-queries-on-list-endpoints.md) Bounded queries on list endpoints | performance | M | TEST-001 | ⚑ |
| 80 | [x] [PERF-003](tasks/PERF-003-bundle-size-baseline.md) Bundle size baseline | performance | S | CICD-001 |  |
| 81 | [x] [REL-004](tasks/REL-004-timeouts-on-server-side-supabase-calls.md) Timeouts on server-side Supabase calls | reliability | S | REL-002 |  |
| 82 | [x] [REL-005](tasks/REL-005-make-multi-step-writes-atomic.md) Make multi-step writes atomic | reliability | M | TEST-001 |  |
| 83 | [x] [REL-007](tasks/REL-007-maintenance-mode-and-status-communication.md) Maintenance mode and status communication | reliability | S | OBS-003 | ⚑ |
| 84 | [ ] [SEC-013](tasks/SEC-013-bot-protection-on-public-forms.md) Bot protection on public forms | security | M | SEC-002 | ⚑ |
| 85 | [x] [SEC-022](tasks/SEC-022-couple-login-must-not-reveal-which-usernames-exist.md) Couple login must not reveal which usernames exist | security | S | SEC-002 | ⚑ |
| 86 | [ ] [SEC-026](tasks/SEC-026-security-txt-and-a-disclosure-contact.md) security.txt and a disclosure contact | security | S | INFRA-002 |  |
| 87 | [ ] [TEST-006](tasks/TEST-006-coverage-reporting-with-a-floor.md) Coverage reporting with a floor | testing | S | TEST-001 |  |
| 88 | [x] [TEST-007](tasks/TEST-007-accessibility-audit-of-the-key-screens.md) Accessibility audit of the key screens | testing | M | TEST-005 |  |
| 89 | [x] [TEST-009](tasks/TEST-009-fast-unit-tests-for-lib-logic-without-a-database.md) Fast unit tests for lib logic without a database | testing | M | TEST-001 |  |
