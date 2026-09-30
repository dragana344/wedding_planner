# Decisions log (production readiness, Sep 2026)

Decisions taken while working through `production-tasks/`, so nobody has to rediscover why. "Owner" items are open and need an answer from the product owner.

## Taken

| Area | Decision | Why | Task |
|---|---|---|---|
| Runtime | Node 22, pinned (`.nvmrc`, `engines`, `engine-strict`) | supabase-js needs native WebSocket (Node ≥ 22); Vercel supports it | INFRA-004 |
| Framework | Next.js 16.3 + React 19; `middleware.ts` → `proxy.ts` (Node runtime) | Only 16.x fixes the critical/high advisories | SEC-024 |
| Lint | ESLint 9 flat config; `react-hooks/set-state-in-effect` off | 14 existing effects would need behaviour-changing rewrites; separate change | SEC-024 |
| Rate limiting store | Postgres table + atomic function, not Upstash | No extra processor, EU data stays in one place, same-region latency | SEC-002 |
| Rate limits | login 10/min/IP, signup 5/h/IP, contact 5/h/IP (fail closed); RSVP 20/h/IP/slug, photo 20/h/event (fail open) | Spec budgets; credential/email/account routes must not run unlimited | SEC-002 |
| CSP | Enforced. `script-src 'unsafe-inline'` (Next inline bootstrap, no nonce proxy), `style-src 'unsafe-inline'` (inline style attributes) | Zero violations on every page (e2e/csp-pages.spec.ts); a nonce would force dynamic rendering everywhere | SEC-001 |
| Privileges | Explicit grants; new tables/functions closed to API roles by default | Supabase Cloud and local CLI start from different defaults; drift check needs them equal | SEC-023, SEC-006 |
| SEC-019 | Explicit `WITH CHECK` added, but the issue was not exploitable | Postgres reuses `USING` as `WITH CHECK` for UPDATE policies without one; kept explicit + regression test | SEC-019 |
| Couple sessions | SHA-256 at rest; no fallback lookup by raw token | A fallback would let a leaked hash be replayed; cost: sessions created in the minutes between migration 0032 and the app deploy must log in again | SEC-008 |
| Couple passwords | Minimum 10 characters in the database; generator makes 12 | Hand-typed passwords like `1234` were accepted | SEC-027 |
| Password regenerate | Ends all couple sessions of that event | The reset exists for leaked credentials | SEC-009 |
| Floor-plan lock | New venues start with no code (set in Settings); existing ones keep theirs | No shared `0000`; least UI change. **The seed/demo venue "Kade Sum" created on 28 Sep still has `0000` — set a code in Settings.** | SEC-010 |
| Double booking | Exclusion constraint on real time ranges (overnight-aware, 3 h default); cancelled/completed don't hold a table | Subset of the app's stricter check, so it never refuses what the UI allows | DATA-012 |
| Public RSVP overwrite | Guests may still change their own answer via the link; every change is recorded (audit) and the couple sees "Одговор преку поканата: <time> (претходно: …)" | Guests genuinely change their minds; blocking would push them to message the couple; visibility closes the silent-sabotage hole | SEC-021 |
| Login enumeration | One message for wrong password, unknown user and locked account | Lockout message confirmed usernames | SEC-022 |
| Placeholder pages | Stay visible and marked "Наскоро"; Support became a real contact page | Matches the approved design; no dead ends | ARCH-003 |
| Invitation photos | Browser → Storage via signed upload; bucket allow-list JPEG/PNG/WebP/GIF/AVIF, 50 MB; magic-byte check before attaching; SVG refused | Vercel's 4.5 MB body limit; public bucket | SEC-005, SEC-028 |
| File cleanup | DB triggers queue deleted/replaced photos; hourly Vercel cron drains; unconfirmed uploads swept after 24 h | Deletes happen from the browser and by cascade; SQL can't delete Storage objects | DATA-011 |
| Multi-step writes | Six operations moved into transactional Postgres functions | Partial writes on failure | REL-005 |
| Errors to users | Only messages our code throws on purpose; everything else → the route's fallback, original logged with request id | Postgres/PostgREST text leaked schema details | SEC-003 |
| Logging | JSON lines, one per API request, request ids from the proxy; PII keys redacted | Queryable logs without personal data | OBS-002 |
| Error tracking | Sentry, off until `NEXT_PUBLIC_SENTRY_DSN` is set; scrubbed events; no tunnel (Turbopack) — CSP allows the ingest host when enabled | | OBS-001 |
| Account deletion | Full deletion (venue, its data, staff users, files) | Default until the owner decides otherwise (see open items) | DATA-005 |
| Event erasure | Keeps the event row (date, type, status, finance) but no personal data | Calendar/reports stay intact | DATA-005 |
| Bot protection | Not now; revisit if rate limits prove insufficient after launch | Spec makes it conditional; avoids a third-party widget and CSP change | SEC-013 |
| Product analytics | Not now | Needs consent design and a tool choice; no need before launch | OBS-007 |
| Maintenance mode | Env flag + team bypass cookie | Rarely needed; expand/contract avoids downtime | REL-007 |
| Plans/entitlements (admin dashboard) | 26-feature catalogue; resolution order event override → venue override → plan → locked (`effective_features`, 0048); a **disabled** feature always resolves its limit to **0**, never "unlimited", regardless of a stale override/plan `limit_value` | A locked `max_guests` etc. must never silently read back as unlimited just because an old row still carries a number | Admin dashboard spec §4.3/§4.4 |
| Entitlement enforcement | Inserts/updates checked; **deletes never gated** (D7); an UPDATE that only nulls out already-set columns also always passes | A locked plan must never block the privacy erasure sweep or a routine `ON DELETE SET NULL` cascade; existing over-limit data stays fully usable, only new writes are refused | Admin dashboard spec §4.4, 0049 |
| Plan visibility | `plans.is_public` (0052), default `false`; only the four pricing-slide packages start public | An admin-created custom/negotiated plan, or a test fixture, must not leak onto `/couple/packages` just because a `plans` row exists | Admin dashboard task 2.8/2.9 |
| Payments | Manual — an admin moves a venue onto/off a plan by hand after payment is confirmed out of band; no billing/subscription integration | No processor chosen yet; entitlements needed to ship before billing does | Admin dashboard spec §4 |
| Maintenance flag (DB half) | `platform_settings.maintenance_mode`, read via a per-instance 30s SWR cache (`peekMaintenanceMode`, never awaited on the hot path) | `proxy.ts` must never block a request on a database round trip; a toggle reaching every instance within ~30s is an acceptable tradeoff for a rarely-flipped admin switch | Admin dashboard task 4.1 |
| Admin access | Separate `platform_admin` role (`app_metadata`, not a table row); own host `admin.<domain>`; mandatory TOTP (no opt-out, unlike staff); never reads guest/couple planning tables (D2, enforced by `tests/security/admin-static.test.ts` reading the source) | Least privilege for the one role that can see across every venue; a compromised admin session should never yield couple/guest data | Admin dashboard spec §3 |
| Admin host rewrite (`proxy.ts`) | Forward the real Host via `x-forwarded-host` and rewrite to `/admin/...` only once (`NextResponse.next()`, not another `.rewrite()`, once the pathname already has its final form) | Found while writing the task 4.3 E2E test: the previous version of this rewrite 404'd on every `admin.<host>` request against a real `next build && next start` (confirmed via curl). `request.nextUrl` never reflects the incoming Host header on Next's internal re-dispatch of this rewrite's own destination (which still matches `proxy.ts`'s own `matcher`) — a Next.js internals quirk, not a Playwright/test artifact | Task 4.3 |
| Admin host trust | `proxy.ts` trusts `x-forwarded-host` (falls back to `host`) to identify the admin host — required for the fix above to survive Next's internal re-dispatch | Safe on Vercel (sets/overwrites the header itself at the edge); a bare `next start` exposed directly, with nothing in front controlling that header, would let a main-host request reach admin pages' *routing* via a spoofed header — `requireAdmin()` still gates real access either way, so this is a routing assumption, not an auth bypass. Documented in `ADMIN.md` so a future self-hosted deploy doesn't miss it | Task 4.3 |
| Blocked venues and privacy self-service | A blocked venue's staff also lose the self-service privacy routes (`/api/venue/privacy/export`, `erase-event`, `delete-account` answer 401 as for non-staff); export/erasure/deletion on request is done via the platform admin | A block must cut every staff capability, including bulk export or destructive actions from a possibly disputed account; the data subject's rights are still served, by the admin | Admin dashboard final review (controller ruling) |

## Open — owner decisions

1. **Plans**: approve Supabase Pro and Vercel Pro (HOSTING.md).
2. **Retention periods** (RETENTION.md): guest data 12 months after the event? contact messages 24 months? Then schedule the purge (exact SQL in RETENTION.md). The privacy policy must state the same numbers.
3. **Account deletion**: keep anything (e.g. anonymised finance history)? Currently everything is deleted.
4. **Staging**: create the staging Supabase project (ENVIRONMENTS.md) so previews and local dev stop sharing production.
5. **MFA**: opt-in now; make it mandatory for staff later?
6. **Legal**: fill company details in the privacy policy/terms/DPA placeholders; consider a human lawyer's check (LEGAL-REVIEW.md).
7. **Domain, Resend, Sentry, R2, uptime monitor**: accounts to create (SETUP.md).
8. **On-call**: names and contacts in INCIDENTS.md.
9. **RSVP form language**: the public RSVP form and some auth messages are still in English (found by the E2E run). Translate to Macedonian?
10. **Accessibility fixes** (A11Y.md): unlabeled inputs, muted-colour contrast, `<html lang="en">` → `mk` — approve the markup/colour changes.
