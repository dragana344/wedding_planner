# 02 - Gap analysis: Coachfio practice vs wedding_planner

Legend: ✅ already equivalent · ⚠️ partial · ❌ missing · ➖ not applicable.
Every ⚠️/❌ row lists the task(s) that close it (checked by the generator: no row without a task, no task without a row).

| Area | Practice | Coachfio reference | Status | wedding_planner today | Task(s) |
|---|---|---|---|---|---|
| Architecture | Consistent API layer | api/deps.py, one error path | ⚠️ | 27 couple routes hand-copy session/JSON/error handling. | ARCH-001 |
| Architecture | Server/client boundary | build-time contract tests | ⚠️ | Service-role modules have no `server-only` guard; resolve-client switches on VITEST. | SEC-014 |
| Architecture | Config validation | core/config.py typed settings, refuse unsafe prod boot | ❌ | Env read with `!` non-null assertions; missing var = runtime 500. | REL-002 |
| Architecture | Transactional integrity | outbox in same txn, savepoints | ⚠️ | Provisioning, seating confirm, agenda swap, menu selection are multi-call, non-atomic. | REL-005 |
| Architecture | Layered domain code (routes -> lib -> DB) | api/ -> core/ | ✅ | app/api -> lib/couple, lib/venue -> Supabase. Clean enough. | - |
| Auth | Password hashing | provider-managed | ✅ | Supabase Auth for staff; bcrypt (pgcrypto `crypt`/`gen_salt('bf')`) for couple credentials. | - |
| Auth | Brute-force lockout (per account) | rate limits + fail-closed | ✅ | verify_event_credentials locks 15 min after 5 failures. | - |
| Auth | Session cookie flags | HttpOnly, Secure, SameSite | ✅ | couple_session: httpOnly, secure, sameSite=lax. | - |
| Auth | Email verification | provider OTP / verified identity | ❌ | Local config has confirmations OFF; no production auth config exists. | SEC-012 |
| Auth | Password policy | provider policy | ❌ | Minimum length 6, no leaked-password check. | SEC-012 |
| Auth | Password reset | verified against real provider | ⚠️ | Flow exists (with a local-only workaround); unverified with production redirects + SMTP. | AUTH-002 |
| Auth | Session refresh / server-side auth gate | require_user dependency on every route | ⚠️ | Venue gate is layout-only; no @supabase/ssr refresh middleware. | AUTH-001 |
| Auth | Session token storage | signed cookie + epoch; DB holds no usable token | ❌ | couple_sessions stores the raw bearer token; UPDATE on every request. | SEC-008 |
| Auth | Session revocation on credential change | session_epoch bump on reset (1247ee8) | ❌ | Regenerating the event password leaves couple sessions alive. | SEC-009 |
| Auth | Authorization on every endpoint | _owned() 404 per match | ✅ | Every couple write is scoped `.eq(event_id)` (reviewed); venue data behind RLS. | - |
| Auth | Multi-factor authentication | mandatory TOTP for staff | ❌ | No MFA for venue staff. | SEC-016 |
| Auth | Revocable staff sessions | sign out everywhere (1247ee8) | ❌ | Staff sign-out is per browser only. | SEC-017 |
| Security | Audit log | admin/storage/audit.py, counts only | ❌ | No record of who changed credentials or deleted events. | SEC-018 |
| Security | Storage policy tenant check | tenant isolation tests | ❌ | Menu-photo update policy lacks WITH CHECK (1 of 35 policies). | SEC-019 |
| Security | Storage listing exposure | signed URLs per object | ❌ | Anon can list every object in the three public buckets (invitation photos named by event id). | SEC-020 |
| Security | RSVP integrity | audit trail for disputed changes | ❌ | Anyone with the invite link can change another guest's RSVP by name. | SEC-021 |
| Security | Account enumeration | 404 never 403 | ⚠️ | 'locked' reveals that a couple username exists. | SEC-022 |
| Security | Least privilege for anon | deny by default | ⚠️ | grant all to anon on every table; RLS is the only barrier. | SEC-023 |
| Security | Known-vulnerable dependencies | CI vulnerability gate | ❌ | next 14.2.35: 1 critical + 1 high (npm audit, 27 Sep 2026). | SEC-024 |
| Security | Security review / pen test | external audit + remediation plan | ❌ | None. | SEC-025 |
| Security | Vulnerability disclosure | - | ❌ | No security.txt. | SEC-026 |
| Reliability | Time zone correctness | explicit time zones | ⚠️ | Dashboard uses Europe/Skopje; five other places use the UTC date. | REL-006 |
| Reliability | Maintenance mode | preview gate switch | ❌ | None. | REL-007 |
| Data | Database constraints | bounded columns | ⚠️ | Venue tables have checks; couple/public text columns are unbounded. | DATA-009 |
| Data | Non-production data policy | tests isolated from real data | ❌ | No seed, no rule. | DATA-010 |
| Compliance | Search-engine exposure of private pages | robots.txt + X-Robots-Tag noindex | ❌ | No robots.txt; invitations with names/dates indexable. | COMP-004 |
| Compliance | Processor agreement with customers | sourced legal positions | ❌ | No DPA with venues. | COMP-005 |
| Delivery | Commercial hosting plan | - | ❌ | Vercel Hobby forbids commercial use. | INFRA-007 |
| Performance | Region co-location | app and DB on one box | ❌ | Function region unset; middleware hits the DB every couple request. | INFRA-007 |
| Delivery | Localized auth emails | own templates | ❌ | Supabase English defaults. | INFRA-008 |
| Quality | Accessibility | a11y test in CI + dated audit | ❌ | Never audited. | TEST-007 |
| Quality | Load testing | measured ceiling before launch | ❌ | Never tested. | TEST-008 |
| Observability | Incident response | dated incident notes, DEPLOY.md | ❌ | No runbook, no on-call. | OBS-006 |
| Observability | Product analytics | GA4 funnel behind consent | ❌ | None. | OBS-007 |
| Security | Couple password policy | provider-enforced policy | ❌ | Staff can set any couple password, e.g. '1234'. | SEC-027 |
| Security | File upload safety (venue buckets) | type sniffing + limits | ❌ | Menu/showcase buckets accept any file type and size. | SEC-028 |
| Data | Orphaned files | object prefix deleted with the row | ❌ | No storage.remove() anywhere; photos outlive deleted events. | DATA-011 |
| Data | Concurrency: double booking | atomic DB-enforced invariants | ❌ | Overlap checked in JS only; concurrent bookings both succeed. | DATA-012 |
| Architecture | Dead schema | replaced code deleted | ⚠️ | event_organizers + function + policies unused since 0013. | ARCH-002 |
| Architecture | Unfinished pages at launch | - | ❌ | 7 nav items open a ComingSoon placeholder. | ARCH-003 |
| Quality | Unit tests for domain logic | offline scripted doubles | ❌ | All lib/ tests need a live DB (32 of 52 files). | TEST-009 |
| Security | Security headers / CSP | api/main.py add_security_headers, tests/test_csp.py | ❌ | next.config.mjs sets no headers. | SEC-001 |
| Security | Clickjacking protection | X-Frame-Options DENY | ❌ | None. | SEC-001 |
| Security | Rate limiting (auth) | core/auth/ratelimit.py | ❌ | No IP-level limit on couple login or signup. | SEC-002 |
| Security | Rate limiting (public write endpoints) | fail-closed on email/cost routes | ❌ | Public RSVP and contact write to DB unthrottled. | SEC-002 |
| Security | Input validation | typed request schemas | ❌ | Bodies used unvalidated; seating POST spreads body into insert. | SEC-004 |
| Security | Injection protection | ORM parameters only | ⚠️ | PostgREST parameterises, except one `.not(...in (ids.join))` filter string built from client ids. | SEC-004 |
| Security | Error message hygiene (no internals leaked) | deliberate messages; internals to logs | ❌ | Routes return `err.message` (raw Postgres errors) to clients. | SEC-003 |
| Security | File upload safety | size caps, type sniffing, AV scan | ❌ | Photo upload: no size/type check, client-chosen extension, public bucket. | SEC-005 |
| Security | Privileged DB function hygiene | tests pin privileged paths | ⚠️ | SECURITY DEFINER functions lack `set search_path`. | SEC-006 |
| Security | RLS coverage guard | guard tests fail on unclassified tables | ⚠️ | All 30 migrations enable RLS today; nothing stops a future table without it. | SEC-007 |
| Security | Insecure shared defaults | refuse dev defaults in prod | ❌ | Every venue's floor-plan lock code defaults to '0000'. | SEC-010 |
| Security | CSRF protection | SameSite + CORS allowlist | ⚠️ | SameSite=Lax only; no Origin check on mutations. | SEC-015 |
| Security | Bot protection | strict limits on signed-out forms | ❌ | None on contact/signup/RSVP. | SEC-013 |
| Security | Secret management | .env.prod 0600, documented example | ⚠️ | .env.local ignored and never committed (checked); no prod secret process or docs. | INFRA-003 |
| Security | Secret scanning | CI secret-scan job | ❌ | No CI. | SEC-011 |
| Security | Dependency scanning | lockfile + CI vulnerability scan | ❌ | No CI, no Dependabot. | SEC-011 |
| Security | Row-level security enabled | n/a (single-tenant API gate) | ✅ | Every table has RLS enabled; service-role-only tables have no client policies. | - |
| Data | Migration process | Alembic, applied on boot, renumber lesson fc1b9ad | ⚠️ | Versioned SQL migrations exist; no pipeline applies them, no drift/duplicate check. | DATA-003 |
| Data | Backups (database) | scripts/backup_db.sh + freshness alert | ❌ | Nothing configured. | DATA-001 |
| Data | Backups (file storage) | scripts/backup_sync.sh | ❌ | Supabase backups exclude Storage; nothing copies photos. | DATA-001 |
| Data | Restore drill | tools/restore_drill.py, CI job | ❌ | Never done. | DATA-002 |
| Data | Indexes | measured against query patterns | ⚠️ | PKs/uniques exist; FK filter columns not reviewed. | DATA-004 |
| Data | Data export (GDPR) | core/storage/erasure.py export | ❌ | None. | DATA-005 |
| Data | Data erasure / account deletion | tombstone erasure + guard test | ❌ | None; guests' personal data kept forever. | DATA-005 |
| Data | Self-service data rights | 'Your data' card on account page | ❌ | None. | DATA-006 |
| Data | Data retention | enforced + tested against the policy | ❌ | Nothing is ever deleted (sessions, contact messages, orphaned photos). | DATA-007 |
| Data | Test/prod data isolation | conftest strips settings env | ❌ | Tests load .env.local and mutate whatever DB it names (local today). | DATA-008 |
| Reliability | Environment separation | dev compose vs prod compose + .env.prod | ❌ | Only local Supabase exists. | REL-002 |
| Reliability | Staging/preview environments | n/a (single box) | ❌ | None. | CICD-003 |
| Reliability | Health checks | /health pings DB + release | ❌ | None. | REL-001 |
| Reliability | Graceful error pages | ErrorState, never a framework screen | ❌ | No error.tsx / global-error.tsx / not-found.tsx. | REL-003 |
| Reliability | Timeouts | per-call timeout + deadline | ❌ | Middleware DB lookup on every couple request, unbounded. | REL-004 |
| Reliability | Queues / background jobs / watchdog | Celery, watchdog, outbox | ➖ | No long-running work; everything is request/response. Revisit if email sending or exports become async. | - |
| Observability | Error tracking | Sentry server+browser, release-tagged | ❌ | None. | OBS-001 |
| Observability | Structured logging | one logger, no PII | ❌ | No logging beyond Next defaults. | OBS-002 |
| Observability | Security event logging | audit lines, counts only | ❌ | Logins, lockouts, password regenerations are not recorded. | OBS-002 |
| Observability | Uptime monitoring | external probe every 10 min | ❌ | None. | OBS-003 |
| Observability | Alerting | complete-findings alert feed | ❌ | None. | OBS-003 |
| Observability | Third-party quota monitoring | capacity page, blind spots reported | ❌ | None. | OBS-004 |
| Observability | Operational visibility of inbound leads | support tickets email the team | ❌ | Contact submissions stored, read by nobody. | OBS-005 |
| Quality | Unit/component tests | pytest + vitest | ✅ | 53 test files: lib, components, schema, RLS. | - |
| Quality | Test suite structure | default run needs no services; integration job | ❌ | `npm test` mixes DB-dependent and pure tests. | TEST-001 |
| Quality | Authorization tests (IDOR) | owner/404 tests | ❌ | No cross-event tests for couple routes. | TEST-002 |
| Quality | RLS isolation tests | real-Postgres integration tests | ⚠️ | Only migration 0004 has an isolation test. | TEST-003 |
| Quality | End-to-end tests | component tests of real behaviour in CI | ❌ | None. | TEST-005 |
| Quality | Lint/type gates | ruff pinned, tsc in CI | ⚠️ | Measured: tsc 0 errors, lint 0 errors/1 warning, build OK - but nothing enforces it. | TEST-004 |
| Quality | Coverage | coverage floor | ❌ | None. | TEST-006 |
| Delivery | Continuous integration | .github/workflows/ci.yml (11 jobs) | ❌ | No CI. | CICD-001 |
| Delivery | CI database tests | integration job with real services | ❌ | None. | CICD-002 |
| Delivery | Continuous deployment | main-only deploy, GIT_SHA stamped | ❌ | No deploy target. | CICD-003 |
| Delivery | Rollback strategy | tagged previous images, DEPLOY.md | ❌ | None. | CICD-004 |
| Delivery | Release traceability | deployed-code CI job, /health release | ❌ | None. | CICD-005 |
| Delivery | Branch protection | reviewed deploys from main | ❌ | Unknown/none (2 commits, pushed direct). | CICD-006 |
| Delivery | Hosting target documented | DEPLOY.md | ❌ | Undecided. | INFRA-001 |
| Delivery | Runbook / deploy doc | DEPLOY.md, SETUP.md | ❌ | None. | INFRA-001 |
| Delivery | Domain, SSL, canonical host | Caddyfile, www -> apex | ❌ | Not set up. | INFRA-002 |
| Delivery | Onboarding docs / README | SETUP.md | ❌ | No README. | INFRA-004 |
| Delivery | Toolchain pinning | uv.lock, pinned Node in Dockerfile | ⚠️ | package-lock.json exists (currently modified, uncommitted); Node not pinned. | INFRA-004 |
| Delivery | Transactional email / deliverability | Resend + SPF/DKIM, DNS traps documented | ❌ | Supabase default SMTP (a few emails/hour). | INFRA-006 |
| Performance | Caching / CDN | immutable hashed assets, no-cache HTML | ⚠️ | Next defaults; storage uploads set no cache-control. | PERF-001 |
| Performance | Image delivery | sized WebP ladder | ⚠️ | Raw <img>, no remotePatterns. | PERF-001 |
| Performance | Pagination / query bounds | bounded lists with has_more | ❌ | Only 2 bounded queries in lib/. | PERF-002 |
| Performance | Bundle baseline | - | ❌ | Never measured. | PERF-003 |
| Compliance | Privacy policy / terms | written from the code, test-held | ❌ | None, while holding third-party (guest) personal data. | COMP-001 |
| Compliance | Data map / processor inventory | docs/vendor-terms-and-content-rules.md | ❌ | None. | COMP-003 |
| Compliance | Cookie consent | consent before analytics | ⚠️ | Only essential cookies today - needs documenting, not a banner. | COMP-002 |
| Compliance | Payments / billing / refunds | AgentaOS webhook, ledger, refund tool | ➖ | No payments in the product (spec: sales happen off-platform). | - |
| Compliance | Admin/back-office dashboard | admin.coachfio.com | ➖ | Out of scope for launch; operators use the Supabase dashboard. Reconsider after launch. | - |
| Compliance | Malware scanning of uploads | ClamAV fail-closed | ➖ | Uploads are images only; SEC-005's allowlist + magic-byte sniffing replaces AV for this surface. | - |

**Totals:** 115 practices · ✅ 7 · ⚠️ 23 · ❌ 81 · ➖ 4
