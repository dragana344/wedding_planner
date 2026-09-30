# Pre-launch security review (SEC-025)

**Date:** 29 Sep 2026
**Reviewer:** independent code review (Claude), working tree at `ac1aced` plus the uncommitted hardening changes (migrations 0031–0044, `proxy.ts`)
**Standard:** OWASP ASVS 4.0.3, Level 1 (the parts that apply to a server-rendered Next.js app on Supabase)

## Scope

- **Authentication and sessions:** `proxy.ts` (CSRF origin check, couple session gate, venue session refresh, maintenance bypass), couple login/logout, `lib/couple/session-*.ts`, venue staff login, TOTP MFA (migration 0044, `app/login/page.tsx`, `components/venue/dashboard/MfaSettings.tsx`), password reset.
- **Authorisation:** every route in `app/api/**`, the `lib/api/handler.ts` wrapper and `lib/api/schemas.ts`, the privacy routes, the cron route, RLS policies and grants as they are in the local database after all migrations, every `SECURITY DEFINER` function, storage policies and buckets.
- **Input handling:** zod schemas, PostgREST filter construction, the invitation photo upload (signed upload, magic-byte check), JSON inputs to the 0041 RPCs.
- **Data exposure:** API error messages, logs and Sentry scrubbing, `/api/health`, security headers and CSP, `noindex`, anonymous bucket listing.
- **Abuse:** rate limits and which IP they trust, RSVP abuse, enumeration.
- **Secrets:** key material in tracked and untracked (non-ignored) files and in git history; service-role code reachable from client bundles.

**Out of scope / not possible from here:** the production Supabase and Vercel dashboards (Auth settings, leaked-password protection, SMTP, Vercel firewall), a DAST scan such as OWASP ZAP against staging, and the Supabase Security Advisor on the hosted project. See [Could not verify](#could-not-verify).

## Method

1. Read the code for every item in scope. Where a document claimed something, the code or the database was checked instead of the document.
2. Dumped the live local database after all migrations: every `SECURITY DEFINER` function (body, `search_path`, ACL), every non-definer function's ACL, table grants to `anon`/`authenticated`, all RLS policies (`public` and `storage`), RLS status per table, default ACLs and bucket settings.
3. Ran the suites: `npm run test:unit` (40 files, 255 tests, all pass) and `npm run test:db` against the local Supabase (58 files, 362 tests, all pass). `npm audit --omit=dev`: 0 vulnerabilities.
4. Probed live behaviour:
   - **Local GoTrue:** a throwaway staff user enrolled TOTP, then tried to get around MFA from a password-only (aal1) session.
   - **Production build against the local Supabase** (`next start -p 3300`, rebuilt with the local URL and keys so nothing touched the hosted project): the couple gate with spoofed headers and path tricks, cross-event IDOR, CSRF, cron auth, rate limits, the invitation page, and anonymous REST and Storage calls.
   - **Clean-up:** all probe rows and users were deleted afterwards and the server was stopped.
5. Every finding below says how it was verified. Anything that could not be verified here is listed as such, not reported as a finding.

## Summary

There are **no Critical, High or Medium findings.** The central controls hold under direct probing:

- the couple session gate and header injection
- RLS isolation between venues, and MFA enforced in the database
- privilege grants
- CSRF
- error sanitisation, apart from the two routes in SR-04

There are 6 Low findings and 10 Info items. All of them are hardening or privacy-hygiene work, and none blocks launch. SR-01 to SR-03 are the ones worth fixing before or soon after launch.

## Findings

| ID | Sev. | Title | Evidence | Exploit scenario | Recommended fix | How verified |
|---|---|---|---|---|---|---|
| SR-01 | Low | Couple username is revealed by response time, and couple passwords use bcrypt cost 6 | `supabase/migrations/0013_couple_dashboard.sql:124` returns early for an unknown username (no `crypt`). `0034_couple_credentials_policy.sql:26,46` uses `gen_salt('bf')`, which defaults to cost 6 (`$2a$06$`). | An attacker times `POST /api/couple/login`: about 3.5 ms more work in the database when the username exists. With enough samples a username can be confirmed, which undoes SEC-022's single message. Only 10 requests/min/IP and a 5-try lockout slow this down. Cost 6 also makes offline cracking of a leaked `event_credentials` dump cheap. | In the not-found branch, run a dummy `crypt(p_password, '<fixed bcrypt hash>')` so both paths cost the same. Use `gen_salt('bf', 10)`; existing hashes upgrade the next time a password is regenerated. | Timed 50 calls each inside Postgres: unknown user 0.04 ms/call, known user 3.54 ms/call. Hash prefix `$2a$06$` read from `event_credentials`. |
| SR-02 | Low | A couple, or venue staff, can attach another venue's menu rows to their own event | `lib/couple/menu.ts:135-157`: `setMenuItemQuantities` looks up `menu_items` by id with no `venue_id` filter, then `replace_menu_item_quantities` (0041) inserts whatever ids it gets. RLS policy `venue staff manage own events` checks only `events.venue_id`, so staff can point `events.menu_template_id` at any template. `lib/couple/dashboard.ts:64` reads that template's name with the service role. `lib/privacy/export.ts:131` joins `menu_items(name)`. | Someone who knows (or has leaked) another venue's menu-item or template UUID links it to their own event. The other venue's dish or template name then shows in their couple dashboard or venue export. The other venue deleting its item also silently removes rows here. Needs a UUID that is not normally exposed, so impact is low. It is still a gap in tenant isolation. | Filter by `.eq("venue_id", event.venue_id)` in `setMenuItemQuantities`, as `setEventMenuSelection` already does. Add a trigger, or a composite FK on `(id, venue_id)`, so `events.menu_template_id` must belong to `events.venue_id`. Do the same for `event_layout_elements.room_id`, whose policy checks only the event. | As couple A over HTTP: `PATCH /api/couple/menu/quantities` with venue B's item id returned 200, and the row joined to "SECREV B secret dish". `PATCH /api/couple/menu` with the same id was correctly refused. As venue staff (role `authenticated`, JWT claims set in psql): `update events set menu_template_id=<venue B template>` succeeded (rolled back). |
| SR-03 | Low | The hashed IP stored for RSVPs and rate limits can be reversed | `lib/couple/rsvp.ts:67`: `sha256("rsvp:" + event_id + ":" + ip)`, and the `event_id` is stored in the same audit row. `lib/security/rate-limit.ts:48`: `sha256(ip)` with no salt at all. | Anyone who can read `audit_log` or `rate_limits` (a backup, the SQL console, venue staff reading their own audit log) can hash all 2³² IPv4 addresses in minutes on one GPU and recover the guest's IP. DATA-MAP and SEC-021 describe these as pseudonymised. | Use an HMAC with a server-only secret (e.g. `AUDIT_HASH_KEY` env var) for both. Or, for the audit trail, store nothing identifying the requester. | Code reading. The event id is in the same row as the hash (`recordAudit` `eventId`). |
| SR-04 | Low | Two couple routes return the raw PostgREST error text | `app/api/couple/contact-info/route.ts:19` and `app/api/couple/guest-count/route.ts:16`: `NextResponse.json({ error: error.message })`. Every other route goes through `errorResponse` / `isUserFacingError` (SEC-003). | Any database error on these updates (constraint, timeout, a future column rule) sends table, column or constraint names to the browser. The zod caps are currently tighter than the database limits, so a normal request can't trigger it today. | Use `errorResponse(error, "<route fallback>", request)` like the other routes. Add both routes to `tests/lib/api/route-validation.test.ts`. | Code reading. Grep for `error.message` in `app/api` finds only these two. |
| SR-05 | Low | The Sentry scrubber misses navigation breadcrumbs | `lib/sentry-scrub.ts:23-28` rewrites only `breadcrumb.data.url`. Sentry's browser navigation breadcrumbs keep the path in `data.from` / `data.to` (`@sentry/browser` `integrations/breadcrumbs.js:204-208`), and `breadcrumb.message` (console breadcrumbs) is not redacted. | Once `NEXT_PUBLIC_SENTRY_DSN` is set, an error after any client-side navigation that touched `/invite/<slug>` sends the slug, which is the guest's credential, to Sentry. Console messages go unredacted too. | Run `scrubUrl` over `data.from` / `data.to` as well, drop or redact `breadcrumb.message`, and scrub `event.transaction`. Add cases to `tests/lib/security/sentry-scrub.test.ts`. | Code reading of the scrubber and the installed Sentry SDK. Not exercised end to end, because Sentry is off locally. |
| SR-06 | Low | Couple sessions have no absolute lifetime | `lib/couple/session-verify.ts:36-39`: 30-day sliding expiry, renewed daily. | A stolen `couple_session` cookie (shared device, backup of a browser profile) stays valid for as long as it is used at least once a month. Only a password regeneration by the venue (SEC-009) ends it. | Store `created_at` and refuse sessions older than, say, 90 days whatever the renewals. Optionally, let couples see and end their other sessions. | Code reading. |
| SR-07 | Info | Venue staff with MFA cannot finish a password reset | `app/reset-password/page.tsx:20` calls `updateUser({ password })` from the recovery session, which is aal1. The page has no code step. | Not a vulnerability. GoTrue correctly refuses: "AAL2 session is required to update email or password when MFA is enabled." The staff member is stuck and needs support. | On `/reset-password`, reuse `pendingSecondFactor` + `MfaCodeForm` from `app/login/page.tsx` before `updateUser`. Add a step to AUTH.md's checklist. | Local GoTrue probe: an aal1 session of an MFA user was refused `updateUser(password)` with that message. |
| SR-08 | Info | Rate limits trust `x-real-ip` / `x-forwarded-for` | `lib/security/rate-limit.ts:61-67` | Safe on Vercel, which sets these headers itself. On any other host or proxy, a client can rotate the header and get unlimited login, signup and contact attempts. The per-username lockout still applies. | Keep hosting on Vercel (HOSTING.md). If that changes, read the IP from the platform's trusted source only. Note it in HOSTING.md. | `next start` probe: 10×401 then 429 for a fixed `x-real-ip`; changing the header reset the count. |
| SR-09 | Info | Per-username lockout can be used to lock a couple out | `0013_couple_dashboard.sql:129` (5 failures → 15 min) | Someone who knows a couple's username can keep them locked out. Usernames are issued by the venue and not public, so this is an accepted trade-off against guessing. | Accept. Optionally, lock per (username, IP) as well as per username. | Code reading. `failed_attempts` counted up during the probes. |
| SR-10 | Info | CSP allows inline scripts | `next.config.mjs:23` `script-src 'self' 'unsafe-inline'` | CSP gives no second line of defence against an XSS. No XSS sink was found: no `dangerouslySetInnerHTML`, and React escapes everything (an injected `<script>` in the invitation message came back escaped). | Already accepted in DECISIONS.md (SEC-001). Revisit with nonces when static rendering is not needed. The comment still says "Next.js 14". | Header read from a live response. Grep for `dangerouslySetInnerHTML`: none. |
| SR-11 | Info | `map_url` accepts any scheme | `lib/api/schemas.ts:229`, rendered at `components/couple/LocationsClient.tsx:109` | The couple can only hurt themselves: the link is shown only in their own panel, and React 19 blocks `javascript:` URLs. It would become a stored-XSS vector if a venue or guest page ever renders it. | Restrict to `https?:` in the schema now. | Code reading. Grep shows the only render site is the couple's own page. |
| SR-12 | Info | Staged invitation uploads are publicly readable until confirmed or swept | `lib/couple/invitations.ts:74-79` (staging path in the public `invitation-photos` bucket) | A signed-in couple could upload any bytes (declared as an image type, ≤50 MB, 20/h) to an unguessable public URL that lives up to 24 h. Minor abuse potential only. | Accept, or stage uploads in a private bucket and copy on confirm. | Code reading, plus bucket settings from `storage.buckets`. |
| SR-13 | Info | Secrets compared with `!==` | `app/api/cron/storage-cleanup/route.ts:10`, `proxy.ts:138-139` | A timing attack over the network against a 32+ character random secret is not practical. | Optional: `crypto.timingSafeEqual`. | Code reading. |
| SR-14 | Info | DELETE of another event's row answers 200 | e.g. `lib/couple/guests.ts:105` | Nothing is deleted (the `event_id` filter matches no row) and nothing leaks. It only hides mistakes from the client. | Optional: return 404 when no row was affected. | Probe: DELETE of venue B's guest as couple A → 200, and the guest was still there. |
| SR-15 | Info | Staff credential RPCs skip their check when called with no JWT claims | `create_event_credentials` / `regenerate_event_password`: `auth.role() <> 'service_role'` is NULL, so not true, when there are no claims | Only reachable by database roles that run SQL without PostgREST (postgres, migrations), which are already trusted. Not reachable through the API. | Write it as `coalesce(auth.role(), '') <> 'service_role'` for clarity. | Seen while creating fixtures as `postgres` in psql. |
| SR-16 | Info | Local `.env.local` points at a hosted Supabase project; docs drift | `.env.local` `NEXT_PUBLIC_SUPABASE_URL=https://vltzigldrqcvkxwylzbx.supabase.co`. SECRETS.md still lists `KV_REST_API_*` as the "planned" limiter, but it is Postgres (0037). | Local dev and builds hit a hosted project, which may be production (DECISIONS open item 4). A local test or probe could write to real data. | Create staging (ENVIRONMENTS.md) and point `.env.local` at the local stack. Update SECRETS.md. | Read the variable names and URL only. No values were printed. |

## ASVS L1 checklist

Status: **Pass**, **Pass\*** (pass, with a Low/Info finding), **N/V** (not verifiable from the repo: production dashboard setting), **N/A**.

| ASVS | Area | Status | Evidence |
|---|---|---|---|
| V1.4 / V4.1.1 | Access control enforced on a trusted service layer | Pass | Couple: `proxy.ts:31-57` removes any client `x-couple-event-id` and sets it only from a valid session. `lib/api/handler.ts:204-215`. Venue: RLS through `is_venue_staff_for` (0004, 0044). |
| V2.1.1 | Password ≥ 12 characters (L1 allows ≥ 8 when with other controls) | Pass\* | Staff 10 (`config.toml minimum_password_length`, AUTH.md). Couples 10 in the database (`0034:22,42`). Production dashboard value N/V. |
| V2.1.7 | Breached-password check | N/V | AUTH.md "Leaked password protection: On" (Pro plan). Dashboard only. |
| V2.2.1 | Anti-automation on credential endpoints | Pass | `app/api/couple/login/route.ts:22` (10/min/IP, fails closed), DB lockout `0013:129-141`, GoTrue rate limits (`config.toml [auth.rate_limit]`). Probe: 11th attempt → 429. |
| V2.2.3 / V3.7 | Secure notification / re-auth for sensitive changes | Pass | `secure_password_change = true`, `double_confirm_changes = true` (`config.toml`). Production N/V. |
| V2.4.1 | Passwords stored with an approved adaptive hash | Pass\* | bcrypt via pgcrypto (`0034:26,46`). Cost 6 → SR-01. Staff passwords are GoTrue's (bcrypt). |
| V2.5.1-2.5.4 | Recovery: no hints, single-use time-limited link | Pass | Supabase recovery link (`app/login/page.tsx:217`, AUTH.md). Same message whether or not the account exists. MFA users → SR-07. |
| V2.8 | TOTP second factor | Pass | Enforced in the database (`0044`). Probe on local GoTrue as an MFA user at aal1: `venue_staff` rows `[]`, `venues` 0 rows; enrolling a new factor → "AAL2 required to enroll a new factor"; removing a factor → "AAL2 required to unenroll verified factor"; changing the password → refused. |
| V3.1.1 | Session token never in URL | Pass | Couple token only in an httpOnly cookie (`login/route.ts:49-55`). Invitation slug is a deliberate capability URL; it is scrubbed from logs (`handler.ts:116-120`). |
| V3.2.1-3.2.3 | New token at login, ≥ 64 bits, stored safely | Pass | `randomBytes(32)` (`session-token.ts:12`), SHA-256 at rest (`session-hash.ts`, `0032`). Cookie `httpOnly; secure; sameSite=lax`. |
| V3.3.1 | Logout invalidates the session | Pass | `logout/route.ts:12` deletes the row. Staff: `signOut`, including `scope: others` after a password change (SEC-017). Password regeneration kills couple sessions (`regenerate_event_password`). |
| V3.3.2 | Re-authentication / absolute timeout | Pass\* | Staff: JWT 1 h + refresh rotation. Couples: sliding 30 days, no absolute cap → SR-06. |
| V3.4.1-3.4.3 | Cookie attributes | Pass | Couple cookie as above. Supabase SSR cookies are set by `@supabase/ssr` with lax/secure. Maintenance cookie httpOnly/secure (`proxy.ts:143`). |
| V4.1.3 / V4.2.1 | Least privilege, no IDOR | Pass\* | Every couple lib query filters `event_id` (grep of `lib/couple/*.ts`). Subtasks check ownership (`checklist.ts:165-178`). Seating checks room/table type (`seating.ts:14-41`). Probe: PATCH on venue B's guest as couple A → 400 and unchanged. Cross-venue menu references → SR-02. |
| V4.2.2 | CSRF protection | Pass | `proxy.ts:18-28` on all `/api/` mutations. Probe: foreign Origin, `Origin: null` and foreign Referer → 403. No Server Actions (`"use server"`: none). |
| V4.3.1 | Admin interfaces protected | Pass | Privacy routes resolve staff through RLS (`lib/privacy/staff.ts`) and scope by `staff.venueId`. Erase needs the typed confirmation. Export without a session → 401 (probe). |
| V4.3.2 | No directory browsing / metadata exposure | Pass | Anonymous `storage/v1/object/list` on all 3 buckets → `[]` (probe). `robots.ts` and `X-Robots-Tag` on private paths (`next.config.mjs:49-50`), noindex meta on `/invite` (probe). |
| DB privileges | Grants and definer functions | Pass | `anon` has no table grants and no function EXECUTE (probe: `permission denied` for a table and for `verify_event_credentials`). All 11 definer functions pin `search_path` (live dump). The ones executable by `authenticated` check `is_venue_staff_for` themselves (`create/regenerate_event_password`, `get_event_username`, `set/verify_venue_layout_password`). Invoker RPCs that take caller ids are `service_role` only (0041, 0043). Default ACLs for `postgres` closed (`0031:84-88`). RLS enabled on all 31 tables. |
| V5.1.3 / V5.1.4 | Input validation, positive allow-lists | Pass | A zod schema for every route body and param (`lib/api/schemas.ts`); unknown keys stripped. UUID regex on ids. `assertUuids` before filters (`menu.ts`). |
| V5.2 / V5.3 | Output encoding, no injection | Pass | React escaping; no `dangerouslySetInnerHTML`. PostgREST builder only (no string-built filters on user input). jsonb RPC inputs are typed through `jsonb_to_recordset` casts (0041). Email sent as JSON text (`lib/email.ts`), so no header injection. |
| V5.2.x (URL) | Untrusted URLs | Pass\* | `map_url` → SR-11. |
| V7.1.1 / V7.1.2 | No credentials or PII in logs | Pass\* | `lib/log.ts:8` key redaction; slugs and ids replaced in route labels. Sentry scrubber → SR-05. Reversible IP hashes → SR-03. |
| V7.4.1 | Generic error messages | Pass\* | `handler.ts:96-110` (only plain `Error` messages reach users). Two exceptions → SR-04. |
| V8.2 / V8.3 | Sensitive data: no caching, minimal exposure | Pass | Export `no-store` (`export/route.ts:26`). Invitation page `no-store` (probe). Public invitation shows no ids (probe). `/api/health` returns only `{ok, release}`. |
| V9.1.1 | TLS / HSTS | Pass | `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `upgrade-insecure-requests`. TLS itself is the platform's (N/V). |
| V10.3.2 | Dependency integrity / known vulns | Pass | `npm audit --omit=dev`: 0 vulnerabilities. Next 16.3.7 (fixes the 14.x advisories; `x-middleware-subrequest` probe → still 401). Dependabot configured. |
| V12.1.1 / V12.5 | Upload size and type limits | Pass | Buckets: raster MIME allow-list and 50 MB (`0040`). Magic-byte check, server-chosen path and extension (`invitations.ts:114-135`, `image-type.ts`). Path regex blocks traversal. SVG refused. Staging exposure → SR-12. |
| V13.1 | API: auth on every endpoint | Pass | Route inventory: couple routes (gate + wrapper), 3 public (`login`, `rsvp`, `contact`: rate-limited), `health` (no data), `cron` (Bearer secret; probe 401 without/wrong), venue signup/privacy (Supabase session). |
| V14.2.1 | Components up to date | Pass | See V10.3.2. |
| V14.3.2 | No debug / verbose info | Pass | `poweredByHeader: false`. Source maps deleted after Sentry upload. Production error pages are generic. |
| V14.4 | Security headers | Pass\* | CSP, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy (live response). `script-src 'unsafe-inline'` → SR-10. |
| V14.5.x | Host/Origin handling | Pass | CSRF check compares the Origin host with `x-forwarded-host`/`host`. A browser cannot set `X-Forwarded-Host` cross-origin without a failing CORS preflight; Vercel sets it itself. |
| Secrets | No key material in the repo | Pass | Grep of all tracked and untracked non-ignored files and full git history for JWT, `sb_secret_`, `re_…` and private-key patterns: nothing. `.env*` ignored (`.gitignore:42`). Service-role module is `server-only`, and every importer is `server-only` or a server route. Client components import only types from server libs. The built `.next/static` has no service key (the only `sb_secret_` string is supabase-js's prefix check). |

## Verified as OK (probes)

- **Couple gate:** no cookie plus a forged `x-couple-event-id` → 401 on the API and 307 to login on pages. Also tried with `%63ouple`, `couple%2F`, `/API/`, `//api`, a trailing slash, `/./`, `/x/../`, `;x`, `%00`, and `x-middleware-subrequest` (both names). Every one gave 401, 404 or 308; none reached a handler.
- **Cross-event writes by a signed-in couple:**
  - PATCH on another event's guest → 400.
  - DELETE on it → no-op.
  - Selecting another venue's menu template or items → refused.
- **CSRF:** a foreign Origin, `Origin: null` or a foreign Referer on a mutation → 403.
- **Cron:** no secret or a wrong secret → 401.
- **Anonymous access with the anon key:** REST to `event_invitations` and RPC `verify_event_credentials` → `permission denied`. Storage listing of all three buckets → `[]`.
- **MFA (local GoTrue, aal1 session of a user with a verified TOTP factor):**
  - no staff row and no venues visible;
  - adding a factor, removing a factor and changing the password were all refused by GoTrue.
- **Invitation page:** `noindex` header and meta, `no-store`, the message is HTML-escaped, and no event or venue ids appear in the HTML.
- **Rate limiting:** couple login gives 429 on the 11th attempt per IP per minute.
- **Tests:** unit 255/255 and database 362/362 pass, including `rls_isolation`, `couple-authz`, `mfa_staff`, `privileges`, `storage_policies` and `login_enumeration`.

## Could not verify

- **Production Supabase Auth settings.** These live in the dashboard (AUTH.md table): confirm email, secure password change, minimum length, leaked-password protection, TOTP enabled, redirect URL allow-list, SMTP. Run AUTH.md's checklists on staging and production and record the results there.
- **Vercel's handling of `x-real-ip` / `x-forwarded-for` / `x-forwarded-host`** on the real deployment (SR-08 assumes Vercel overwrites them, as documented).
- **An authenticated DAST scan (OWASP ZAP) and the Supabase Security Advisor** on a staging project. There is no staging project yet (DECISIONS open item 4).
- **Sentry end to end** (SR-05 is from code reading; Sentry is off locally).
- **Whether the hosted project in `.env.local` is production** (SR-16). It was deliberately not contacted.

## Disposition

| ID | Decision |
|---|---|
| SR-01, SR-02, SR-04 | Fix: small, contained changes. Recommended before launch. |
| SR-03, SR-05, SR-06 | Fix soon after launch (privacy hygiene), or accept with a note in DATA-MAP.md. |
| SR-07 | Fix before MFA is promoted to staff (functional gap). |
| SR-08 – SR-16 | Accepted / informational, with the reasons given in the table. |

The owner makes the final call on each disposition. SEC-025's acceptance criterion ("every finding fixed or accepted with a reason") is met once this table has been confirmed.

## Resolution (29 Sep 2026)

| ID | Status | What changed / why accepted | Evidence |
|---|---|---|---|
| SR-01 | **Fixed** | Unknown usernames run a dummy bcrypt (same cost as a real check); couple passwords use `gen_salt('bf', 10)`; old cost-6 hashes upgrade on the next reset | migration 0045; `tests/supabase/security_review_fixes.test.ts` |
| SR-02 | **Fixed** | Triggers refuse cross-venue references for every role: event menu template, event layout room/table type, room layout table type, custom menu items, menu quantities | migration 0045; same test file; `rls_isolation.test.ts` accepts `23514` or `42501` |
| SR-03 | **Fixed** | IP pseudonyms are HMAC-SHA256 with a server secret (`IP_PSEUDONYM_SECRET`, else the service-role key) for rate-limit keys and the RSVP audit | `lib/security/pseudonym.ts` |
| SR-04 | **Fixed** | contact-info and guest-count use `errorResponse` (route fallback, original logged) | same test file |
| SR-05 | **Fixed** | Scrubber also cleans `event.transaction`, breadcrumb `message`, `data.from`/`data.to`; query strings removed anywhere in a URL | `lib/sentry-scrub.ts` |
| SR-06 | **Fixed** | Couple sessions end 90 days after login regardless of sliding renewal | `lib/couple/session-verify.ts`; same test file |
| SR-07 | **Fixed** | `/reset-password` asks for the TOTP code first when the account has MFA | `app/reset-password/page.tsx`, `components/auth/MfaCodeForm.tsx` |
| SR-08 | Accepted | Production runs on Vercel, which sets `x-real-ip`/`x-forwarded-for`; documented in `lib/security/rate-limit.ts`. Revisit if hosting changes | — |
| SR-09 | Accepted | Per-username lockout is the intended brute-force defence; the per-IP limit (SEC-002) bounds how often one attacker can re-lock; the venue can regenerate the password | — |
| SR-10 | Fixed (comment) / Accepted | CSP `unsafe-inline` is a recorded decision (DECISIONS.md); stale "Next 14" comment corrected | `next.config.mjs` |
| SR-11 | **Fixed** | `map_url` must be `http(s)://` or empty | `lib/api/schemas.ts`; `tests/lib/api/schemas.test.ts` |
| SR-12 | Accepted | Staging uploads use unguessable UUID paths, are never linked, and are swept after 24 h | `lib/storage-cleanup.ts` |
| SR-13 | **Fixed** | Cron and maintenance-bypass secrets compared with `timingSafeEqual` | `lib/security/safe-equal.ts` |
| SR-14 | Accepted | Scoped deletes of another event's row are no-ops (nothing deleted); returning 200 reveals nothing | — |
| SR-15 | Accepted | Only trusted database roles (postgres/migrations) have no JWT context | — |
| SR-16 | Fixed (docs) / Owner | Upstash references removed. `.env.local` pointing at the hosted project is the known pre-launch setup; move local dev to staging (ENVIRONMENTS.md) | — |

Still to do on staging/production (cannot be done from the repo): OWASP ZAP authenticated scan, Supabase Security Advisor, confirm the Auth dashboard settings in AUTH.md, Sentry end-to-end.
