# 01 - Coachfio reference: how a codebase became production-grade

Source: `~/Desktop/GoDevLab/Current Projects/coachfio` (the brief said `~/Desktop/coachfio`; that path does not exist - this is the same project). 410 commits, a 600-line `CLAUDE.md` of architecture and hard-won gotchas, `SETUP.md`, `DEPLOY.md`, and dated design notes in `docs/`. Read-only; no code, secrets or branding copied - only patterns, paths and commit ids.

Stack difference to keep in mind: Coachfio is Python/FastAPI + Postgres (Alembic) + Redis + Celery + a React/Vite SPA, self-hosted with Docker Compose behind Caddy on one droplet. `wedding_planner` is Next.js + Supabase. Each practice below is stated as a **pattern**; the tasks translate it.

## The meta-lessons (why Coachfio is the way it is)

These recur across the history and are more valuable than any single file:

1. **A check that cannot answer must not read as "fine".** The alert probe posts its complete findings, so an unreadable reading is itself a finding (`scripts/alerts.sh`, `tests/test_alerts_script.py`). The capacity page reports unreadable limits as blind spots, never guesses.
2. **Green locally is not green in CI.** Three separate incidents (a DB-dependent test, skipped integration tests, a gitignored build artefact) kept `main` red while every laptop was green (`CLAUDE.md`, "Dev environment gotchas"). Tests must not depend on what happens to be running on a developer machine.
3. **Guard tests instead of conventions.** Whenever a list must stay in sync with reality (erasure rules vs tables, host-gate prefixes vs routes, price text vs catalogue, scanner ceiling vs upload cap), a test reads the real source and fails the build on drift (`tests/test_erasure.py`, `tests/test_admin_routes.py`, `tests/test_scan_ceiling_covers_uploads.py`).
4. **Fail closed where failing open costs money or trust.** Rate limits on email-sending and payment routes fail closed; the rest fail open (`core/auth/ratelimit.py`, commit `6697bad`).
5. **Say why, with a date.** Comments record the incident that caused a rule, so nobody "simplifies" it away.

## Practices, where they live, why they exist

### Architecture
| Practice | Where | Why |
|---|---|---|
| One core that knows nothing about games; plugins in `adapters/`; a test fails if a game id leaks into core | `CLAUDE.md` "The one rule", `tests/test_core.py` | Keeps the product general; enforced, not hoped for |
| One dependency resolves the caller; one error path | `api/deps.py`, `api/main.py` handlers | Routes never re-implement auth or error shaping |
| Typed settings, production refuses unsafe config at boot | `core/config.py`, `api/main.py` | A missing secret fails at start, not on the first request |
| Multi-row changes in one transaction; intent-to-run committed with the status (outbox) | `core/pipeline/outbox.py`, commits `ffa2d6f`, `586720f` | A crash between two commits left paid matches that never ran |

### Users and auth
| Practice | Where | Why |
|---|---|---|
| Hosted identity provider; never roll your own passwords | `core/auth/supabase.py`, `api/routes/auth.py` | Half-built credential handling is worse than none |
| Dev-only sign-in refused once a provider is configured | `api/routes/auth.py::_refuse_unverified_signin` | A fallback becomes a bypass |
| Revocable sessions: cookie carries an epoch, sign-out-everywhere bumps it | `api/deps.py` (`refuse_stale`), migration 0022, commit `1247ee8` | A copied cookie could not otherwise be killed |
| Signed-in gate on every data route; 404 not 403 for another user's object | `api/deps.py::require_user`, `api/routes/matches.py::_owned` | 403 confirms existence |
| Admin: separate cookie, mandatory TOTP, revocable too | `admin/`, migration 0023 | The higher privilege needs the stronger control |

### Security
| Practice | Where | Why |
|---|---|---|
| Security headers + CSP with no inline scripts, tested | `api/main.py::add_security_headers`, `tests/test_csp.py`, commits `d5531ec`, `a2488ae` | XSS/clickjacking defence that cannot silently disappear |
| Per-IP rate limits, fail-closed on email/cost routes, 503 not 429 on limiter outage | `core/auth/ratelimit.py`, commits `a5c0070`, `cc6c05e`, `6697bad` | One script could exhaust the sign-in email quota |
| Body-size caps at edge and in app, per route class | `deploy/Caddyfile`, `api/main.py::_BodyCap`, `tests/test_body_caps.py`, commit `19f00ec` | An anonymous POST could make the API buffer 500 MB |
| Upload admission: sniff real type, enforce limits, malware scan fail-closed, scanner ceiling >= upload cap | `core/pipeline/media_admission.py`, `core/security/upload_scan.py`, commits `1792f7b`, `5cb2a1b` | Oversized files were silently skipped and "passed" |
| Typed request schemas, bounded fields | `api/schemas.py` | Validation before any query |
| Secret-scan + dependency vulnerability scan in CI, reproducible lock | `.github/workflows/ci.yml` (secret-scan), `uv.lock`, commits `6dc267f`, `5e7b5c9`, `3bebf2e` | A leaked key or vulnerable dep fails the build |
| Secrets only in `.env.prod` (0600) and host config; example file documents every var | `.env.prod.example`, `DEPLOY.md` | Nothing secret in git |
| Audit log for sensitive reads/writes, counts only, never contents | `admin/storage/audit.py`, commit `935a47d` | The log must not become a second copy of the data |
| Vault: envelope encryption bound to row id | `admin/vault_crypto.py` | DB write access without the key cannot relocate a secret |

### Data
| Practice | Where | Why |
|---|---|---|
| Schema only via versioned migrations, applied on boot; duplicate numbers caught | `migrations/`, commits `fc1b9ad`, `7b48fe2` | Hand patches drifted; two branches claimed revision 0041 |
| Scheduled DB dump, off-host sync, freshness alert | `scripts/backup_db.sh`, `scripts/backup_sync.sh`, `scripts/backup_freshness.sh`, commit `1431ab7` | A backup nobody checks is not a backup |
| Restore drill, scheduled, in CI | `tools/restore_drill.py`, `scripts/restore_drill_monthly.sh`, CI `restore-drill` job | The only proof a backup works is a restore |
| Complete export and erasure; tombstone keeps financial history anonymised; guard test on new tables | `core/storage/erasure.py`, `tests/test_erasure.py`, commits `32bd54c`, `13ae8a3` | The first version missed six tables and a cascade contradicted the policy |
| Retention stated in policy and enforced in code, tested together | `tests/test_retention_matches_the_policy.py`, commits `a2bfd32`, `fca039d` | A policy claiming retention the code does not apply |
| Tests cannot reach a real database | `tests/conftest.py::isolated_settings` | Env vars leak into test runs |

### Reliability
| Practice | Where | Why |
|---|---|---|
| `/health` pings the DB and reports the release | `api/main.py`, commits `d3d558b`, `1d0a8c8` | Uptime checks and deploy verification read it |
| Timeouts + wall-clock deadlines on every external call | `core/config.py` (`gemini_http_*`), commit `8007cd3` | A provider outage held matches for an hour |
| Stuck-work watchdog swept on read; refunds only when nothing was spent | `core/progress/watchdog.py`, commits `ebe0dad`, `17ffac6` | Paid work stuck forever with no signal |
| Queue visible and finite; refuse before charging when full | `core/pipeline/queueing.py` | A backlog condemned its own tail |
| Graceful user-facing errors; failures reported, raw internals never shown | `web/src/ui/states.tsx`, `web/src/lib/uploadErrors.ts` | "Upload failed (413)" helped nobody |

### Observability
| Practice | Where | Why |
|---|---|---|
| Sentry on API, worker and browser, release-tagged, nothing personal | `core/observability.py`, `web/src/lib/errors.ts`, `api/routes/client_errors.py`, commits `03f201e`, `4b48fd8` | Breakage for other people is otherwise invisible |
| Alerts land in a dashboard as conditions that resolve, from two probes (host + app) | `scripts/alerts.sh`, `admin/probe.py`, `admin/storage/alerts.py`, commits `115498e`, `eaac529` | A row is a problem, not a message |
| Capacity page: every provider ceiling in one unit, blind spots named | `admin/storage/capacity.py` | "The box looks idle" is not evidence |
| Cost reconciled against the provider's bill | `admin/storage/reports.py`, `admin/storage/spending.py` | Recorded cost must equal charged cost |
| Deployed-code check: the live release is reviewed code | `tools/deploy_binding.py`, CI `deployed-code` job, commit `40c30f7` | Hand-deploys of unreviewed code |

### Quality
| Practice | Where | Why |
|---|---|---|
| Default test run needs no services; integration tests are a separate CI job | `pyproject.toml` (`addopts`), CI `integration`, commit `f76dc49` | The "green local, red CI" incidents |
| Lint rules pinned; type/lint gates in CI | `pyproject.toml [tool.ruff.lint]` | A linter upgrade must not re-opine silently |
| Coverage floor | commit `a1d5028` | Coverage cannot erode quietly |
| Contract tests read the real source (prices, pages, routes) | `tests/test_react_migration.py`, `tests/test_page_meta.py` | Two lists in two languages must agree |

### Delivery
| Practice | Where | Why |
|---|---|---|
| CI with 11 jobs: test, web, admin-ui, integration, docker-build, secret-scan, release-gates, restore-drill, deployed-code | `.github/workflows/ci.yml` | Every class of breakage has a gate |
| Deploy from main only; image stamped with `GIT_SHA`; exact commands in one doc | `DEPLOY.md`, `Dockerfile` | Every compose command on prod must name the prod file (a bare one silently recreated prod with dev config) |
| Previous images tagged for rollback | `pre-truth-*` tags, commit `1792f7b` | Minutes to revert |
| Clean release export, never a raw zip | `scripts/make_release.sh` | No local junk shipped |
| One canonical host, www redirects | `deploy/Caddyfile`, commit `bd58c4a` | Google picked the wrong canonical |

### Performance
| Practice | Where | Why |
|---|---|---|
| Hashed assets immutable, HTML/CSS/JS revalidated | `api/main.py` Cache-Control | A stale script cost debugging time |
| Media served from the object store via signed URLs, not proxied | commit notes 24 Sep 2026 in `CLAUDE.md` | Every byte crossed the box twice |
| Images captured/sized for their display width | `tools/make_webp.py` | Unreadable screenshots |
| Bounded lists that say when they were cut | `admin/storage/reports.py` (`has_more`) | A truncated list read as complete |

### Legal / ops
| Practice | Where | Why |
|---|---|---|
| Privacy policy written from the code: every processor real, every retention enforced | `web/src/pages/legal/Privacy.tsx`, commits `610a50b`, `2e6e9d6` | Trust page must be true |
| Terms derived from the product catalogue by test | `tests/test_terms_cover_every_product.py` | A contract that forgot a product |
| Consent before analytics; beacons disclosed | `frontend/consent.js`, commit `849dcee` | Legal requirement |
| Vendor terms read and dated | `docs/vendor-terms-and-content-rules.md` | Closed risks must not stay "open" |
| Email: verified sending domain, SPF/DKIM, DNS traps documented | `DEPLOY.md` (email section), commits `849dcee`, `1963ad4` | Forwarding mode once deleted the MX and killed sign-in emails |
| Support as a ticket system that notifies the team | `core/support/` | A form nobody reads loses customers |

### Found beyond the brief's list
- **Guard against permission laundering and dev defaults in prod** (refuse to boot).
- **Stale-config detection:** the edge config on disk vs the one running is compared by hash and alerted (added 27 Sep 2026 after a two-day silent mismatch).
- **Every dated gotcha is kept in `CLAUDE.md`** - an institutional memory that survives people and sessions. `wedding_planner` should start the same file (INFRA-004).
