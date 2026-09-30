# Admin dashboard (platform operator)

The admin dashboard (`app/admin/**`) is the platform operator's own panel — separate from venue staff (`app/venue`) and couples (`app/couple`). It lives on its own host, `admin.<domain>`, is gated by a mandatory second factor, and can see and change platform-wide configuration (plans, venue/event overrides, blocking, maintenance mode) but never a venue's or couple's actual planning data.

## Who is the admin

There is one role, `platform_admin`, stored in `auth.users.app_metadata.role`. It is not a database table row — no `admin_users` table exists — so granting or revoking it is a single Supabase Auth API call. An admin account:

- Is never venue staff. Migration `0047_admin_foundation.sql`'s `venue_staff_not_platform_admin` trigger refuses inserting a `venue_staff` row for a user whose `app_metadata.role` is `platform_admin`, and `scripts/make-admin.mjs` symmetrically refuses to grant the role to an existing venue-staff account. Use a separate email address.
- Must have a verified TOTP factor to reach the panel at all (below) — there is no "admin without 2FA" state once past `/admin/login/mfa`.

### Creating an admin

Run this once per admin, from your own machine, against the production env file — **never commit that file, never paste its contents in chat**:

```bash
node --env-file=<prod env> scripts/make-admin.mjs <email>
```

- If the email doesn't exist yet, it creates the Auth user with `app_metadata.role = "platform_admin"` and emails a password-reset/set-password link (via `resetPasswordForEmail`; the link lands on `$NEXT_PUBLIC_SITE_URL/reset-password` when that variable is set, else on Supabase's Site URL).
- If the email already exists (and isn't venue staff), it just sets `app_metadata.role = "platform_admin"` on the existing user.
- Refuses (exit 1) if the email belongs to venue staff.

After running it, sign in at `https://admin.<domain>/login` and enrol TOTP — the panel refuses entry until you do (below).

## Mandatory TOTP and recovery

Every admin session must be `aal2` (TOTP-verified), not just password-verified (`aal1`). `lib/admin/guard.ts`'s `checkAdmin`/`requireAdmin` check both `claims.aal === "aal2"` (from the verified JWT) **and** re-confirm `app_metadata.role === "platform_admin"` against the Auth server on every call — never trusted from a cached cookie.

**Login flow** (`components/admin/AdminLogin.tsx`):
1. `/admin/login` — email + password.
2. If the account already has a verified TOTP factor, the same page asks for the 6-digit code inline (`MfaCodeForm`) and, on success, goes to `/admin`.
3. If it has **no** verified factor yet, the admin is sent to `/admin/login/mfa` — mandatory enrolment (QR code + secret + confirm code, the same `MfaSettings` panel venue staff use), then back to `/admin/login` to sign in for real.

There are no backup codes (same policy as venue staff MFA, `AUTH.md`).

**Recovery (lost device):** verify the admin's identity out of band first (a call to a known number, not just a reply from the email address — the same bar as staff recovery), then in the Supabase dashboard → Authentication → Users → the user → **MFA factors**, delete the TOTP factor (or `auth.admin.mfa.deleteFactor({ userId, id })` with the service role). The admin signs in with the password alone and is routed straight back to mandatory enrolment. Record who did it and why in the support log.

## `admin.<domain>` setup

The admin panel is **not** a separate Vercel project or deployment — it's the same Next.js app, routed by host in `proxy.ts` (`lib/admin/host.ts`'s `isAdminHost`, `/^admin\.[^.]/i`):

- Requests to `admin.<domain>/**` are rewritten to `/admin/**` internally (so `admin.<domain>/plans` serves `app/admin/(panel)/plans/page.tsx`).
- Requests to the **main** host's `/admin` or `/admin/**` get a plain 404 — the admin UI is unreachable from the main domain, by path or otherwise.

Setup steps (see `SETUP.md`'s "Админ поддомен" step and `DOMAIN.md`):
1. **Vercel** → the same project → Settings → Domains → add `admin.<domain>` (a second domain on the same project, not a new project).
2. **DNS**: a `CNAME admin → cname.vercel-dns.com` record (or whatever Vercel's domain screen shows for it) — the apex/`www` CNAME does not cover a third subdomain automatically.
3. **Supabase** → Authentication → URL Configuration → **Redirect URLs**: add `https://admin.<domain>/**`, alongside the existing venue-staff redirect URLs (`AUTH.md`). Locally this is `http://admin.localhost:<port>/**` — E2E covers this against `http://admin.localhost:${E2E_PORT}`, and `*.localhost` resolves to loopback without any `/etc/hosts` entry.

No new environment variables: the admin panel uses the same `NEXT_PUBLIC_SUPABASE_URL`/keys as the rest of the app.

**Host-routing trust assumption.** `proxy.ts` identifies the admin host from `x-forwarded-host` (falling back to `host`) rather than `host` alone — needed so the routing decision survives Next's own internal re-dispatch of a rewritten request (see the comment in `proxy.ts`). That means it trusts `x-forwarded-host` outright. Safe on Vercel, which sets/overwrites that header itself at the edge before the app ever sees it. **Not** safe for a bare `next start` exposed directly to the internet with nothing in front of it: a request to the *main* host carrying its own `x-forwarded-host: admin.<domain>` header would be routed to the admin pages' internals. This is a routing quirk, not an authentication bypass — `requireAdmin()` (aal2 + `platform_admin` role, re-checked against the Auth server) still gates every admin page and Server Action regardless of how the request got routed there — but it does mean this app must always sit behind a proxy that controls `x-forwarded-host` (Vercel; or, self-hosted, a reverse proxy configured to strip/overwrite client-supplied forwarding headers before they reach `next start`).

## What the admin can and cannot see (D2)

The admin dashboard is platform operations, not a backdoor into couples' or guests' private planning data. Enforced two ways:

1. **By code convention**, checked by `tests/security/admin-static.test.ts` (reads the source): `app/admin/**` and `lib/admin/**` never reference guest/couple planning tables — `event_guests`, `event_notes`, `event_budget_items`, `event_checklist_items`, `event_checklist_subtasks`, `event_agenda_items`, `event_locations`, `event_invitations`, `event_custom_menu_items`, `event_menu_item_quantities`, `couple_sessions`, `event_credentials` (except through the `admin_unlock_couple_login`/`admin_sign_out_user`/couple-password-regenerate RPCs, which never read their contents) — and never select `reservations.guest_name/phone/email/note` or `events.contact_email/contact_email_2/contact_phone`.
2. **By what's actually exposed**: `lib/admin/queries.ts` reads venues, events (date/status/couple name — not guest data), plans/entitlements, `audit_log`, `platform_settings`, and `contact_submissions` — never a couple's guest list, budget, checklist, notes, agenda, locations, custom menu, invitation content, or login credentials.

What the admin **can** do: rename a venue, change its plan, add per-venue or per-event feature overrides (with a free-text note — see below), block/unblock a venue, reset a staff member's password or remove their MFA or sign them out, unlock a couple's login lockout (this also clears the lockout of the event's co-organizer logins, migration 0084) or regenerate their password (the password itself, never seen or read back — see `EventAdminPanels.tsx`'s `CoupleAccessPanel`), read/triage contact-form submissions, flip maintenance mode, and read the audit log.

## Plans and entitlements

### The model

- **`plans`**: a named tier (`Стандарден`, `START`, `PREMIUM`, `PREMIUM+`, `ULTRA`, or any admin-created custom plan). Exactly one plan has `is_default = true` at a time (`plans_single_default` unique index) — every new venue starts there (`provision_venue`, 0048). `Стандарден` is the seeded default: every one of the 26 features on, no limits, except `storage_gb = 5` and `photo_retention_days = 15` — this is the pre-existing behaviour for every venue that predates entitlements, and it must never change.
- **`plan_features`**: one row per `(plan_id, feature_key)` — the plan's own catalogue of all 26 features, each `enabled` plus an optional `limit_value` for the three limit-kind features (`max_guests`, `max_rooms`, `max_active_events`) and the two capacity-kind ones (`storage_gb`, `photo_retention_days`) and `co_organizers`.
- **`venue_feature_overrides`** / **`event_feature_overrides`**: sparse, admin-only exceptions on top of a venue's or a single event's plan — `enabled` (nullable: `null` means "inherit from the plan"), `limit_override` + `limit_value`, and a free-text `note` (see below).

### Resolution order (D7)

`effective_features(venue_id, event_id)` (migration `0048_plans_and_entitlements.sql`) resolves each of the 26 keys in this order, first match wins:

**event override → venue override → plan → locked.**

This is actually **two independent chains**, not one — `enabled` and `limit` each resolve down their own override levels, regardless of which level supplied the other:

- **`enabled`**: `coalesce(event_override.enabled, venue_override.enabled, plan_feature.enabled, false)`.
- **`limit`** (raw, before the disabled→0 rule below): the first level whose `limit_override = true` wins — `event_override` (if `limit_override`), else `venue_override` (if `limit_override`), else the plan's own `limit_value`, else `0`. A level can set `enabled` without touching the limit at all (`limit_override = false`, the default), in which case the limit falls through to the next level exactly as if that level hadn't set `enabled` either — e.g. a venue override can turn a feature on while a plan-level or event-level limit still applies untouched.

**Disabled always means limit = 0, never "unlimited".** The final projection forces `limit_value` to `0` whenever the resolved `enabled` is `false`, regardless of what raw number a stale override or plan row happens to carry — a disabled `max_guests` can never be misread as unlimited.

**Deletes are never gated (D7).** The enforcement triggers (`0049_entitlement_enforcement.sql`) attach only to `INSERT`/relevant `UPDATE`, never `DELETE` — a venue whose plan changed to lock a feature it already used keeps that existing data fully readable and removable; only *new* writes are refused. Likewise, an `UPDATE` whose only effect is nulling out already-set columns (erasure sweeps, `ON DELETE SET NULL` cascades) always passes, even on a locked feature — otherwise a locked plan could permanently wedge the privacy retention sweep or a routine FK cascade.

**Where the capacity limits take effect** (S1 follow-ups): `storage_gb` is the guests' album quota per event (GB × 1024³, null = unlimited, shown as „Неограничено“ on the couple's storage meter; uploads fail closed if the entitlements can't be read). `photo_retention_days` is how long the album is kept after the event (purged only when enabled with a positive limit; disabled, null or 0 = forever); the sweep runs only once the owner sets `MEDIA_RETENTION_ENABLED=true` (`RETENTION.md`). `co_organizers` caps the event's co-organizer logins (trigger 0083, „Достигнат е лимитот од {n} дополнителни организатори.“). `reminders`, `personal_invite_links`, `photo_album`, `guest_greetings` and `video_greetings` also gate the reminders cron and the guests' public album routes (`/api/e/<token>/…`, 403 with the locked message), not only the couple's pages. Staff password-reset emails (Venues — staff support) link to `/reset-password` on `NEXT_PUBLIC_SITE_URL` (else the request's Host via `lib/origin.ts`, with a leading `admin.` removed so the link never lands on the admin host), so that URL must be in Supabase's Redirect URLs.

**On the couple API** (`lib/api/handler.ts`'s `withCoupleEvent`, `HandlerOptions.feature`): only `POST`/`PUT`/`PATCH` on a gated route check the feature; `GET` and `DELETE` always pass. A locked mutation answers `403 { error: "Оваа функција не е вклучена во вашиот пакет." }` — checked **after** the request body passes its own Zod schema, so a malformed body still 400s first.

**Override notes may contain business terms** ("waived per contract", "negotiated with owner") **but never personal data** — they are the admin's own justification, not authored by or belonging to the venue/couple, and are excluded from the venue's own privacy data export (`DATA-MAP.md` §2.14).

### `is_public`

`plans.is_public` (migration `0052_plans_is_public.sql`) controls whether a plan appears on the public `/couple/packages` pricing page — **not** whether it's usable. It defaults to `false`: the seeded default plan and any admin-created custom/negotiated plan stay hidden unless an admin explicitly opts one in (`PlanAdminPanels`'s "Прикажи на страницата Пакети" checkbox). Only the four pricing-slide packages (`START`, `PREMIUM`, `PREMIUM+`, `ULTRA`, seeded in `0051_seed_packages.sql`) are public out of the box. This exists so a one-off negotiated plan, or a test fixture, never leaks to couples just because a `plans` row exists.

**Payments are manual for now.** There is no billing/subscription integration — moving a venue onto a paid plan (or back off one) is the admin doing it by hand on the venue's detail page, after payment is confirmed out of band. Revisit if/when a payment processor is wired up.

## Blocking (D8)

Blocking a venue (`venues.blocked_at` / `blocked_reason`, admin-only — `venues_protect_admin_columns` trigger refuses a change to these two columns from any `authenticated`/`anon` session, only the service role can set them) is a harder cutoff than a locked plan feature:

- **Venue staff see no data at all.** `is_venue_staff_for` (security definer, used by every RLS policy that gates on venue access) requires `venues.blocked_at is null` — a blocked venue's staff still have their `venue_staff` row, but every RLS-gated query returns empty.
- **The couple's login and existing sessions are refused.** `lib/couple/session-verify.ts` checks the event's venue's `blocked_at` on every session validation; `POST /api/couple/login` checks it right after the credentials verify and before issuing a session. Both answer with the same message as the venue panel's `BlockedScreen`: `„Пристапот е привремено оневозможен.“`
- **Guests are unaffected.** The public RSVP/invitation routes don't check `blocked_at` — a guest can still RSVP on a blocked venue's event.
- **Staff cannot self-unblock or change their own plan.** The protect-admin-columns trigger applies regardless of block state.

## Maintenance mode

Two independent switches, both read in `proxy.ts` before any route runs (except the admin host itself, which never reaches this check, and `/api/health`, which always reports the real state):

- **`MAINTENANCE_MODE=1`** env var — instant, requires a redeploy/restart to change.
- **The DB flag**, `platform_settings.maintenance_mode` (migration `0050_contact_status_and_settings.sql`), flipped from the admin **Систем** page (`components/admin/MaintenanceToggle.tsx`) — takes effect **within 30 seconds**, not instantly. `lib/platform-settings.ts` keeps a per-instance in-memory cache with a 30s TTL (`TTL_MS`); `proxy.ts` reads it synchronously (`peekMaintenanceMode()`, never awaited on the hot path) and kicks off a background refresh via `event.waitUntil` when the cache is stale. Because `proxy.ts` and the admin Server Actions are separate deployed function instances, a toggle from one admin panel instance doesn't push to every proxy instance — each one picks it up on its own next stale read, so different visitors can see the old and new state for up to ~30s after a change.

Either switch on: everyone gets a 503 maintenance page (API callers a JSON 503), except a team member who opens any URL once with `?maintenance_bypass=<MAINTENANCE_BYPASS_TOKEN>` to get a bypass cookie.

## Audit log

Every admin mutation is recorded to the shared, append-only `audit_log` table (migration `0042`, `actor_type = 'admin'`, `actor_id` = the admin's `auth.users.id`) via `lib/admin/actions.ts`'s `adminAction` wrapper (guard → validate → run → audit — every admin Server Action goes through it; `tests/security/admin-static.test.ts` enforces the shape). Visible on the admin **Audit log** page (`/admin/audit`) and the last 20 on the overview page.

Every `admin_*` action currently recorded (from `lib/admin/*-actions-core.ts`):

| Action | From |
|---|---|
| `admin_venue_renamed` | Venues — rename |
| `admin_venue_plan_changed` | Venues — change plan |
| `admin_venue_override_saved` | Venues — feature override |
| `admin_staff_password_reset_sent` | Venues — staff support |
| `admin_staff_mfa_removed` | Venues — staff support |
| `admin_staff_signed_out` | Venues — staff support |
| `admin_venue_blocked` | Venues — block |
| `admin_venue_unblocked` | Venues — unblock |
| `admin_venue_deleted` | Venues — delete account |
| `admin_event_updated` | Events — edit date/times/status |
| `admin_event_override_saved` | Events — feature override |
| `admin_couple_login_unlocked` | Events — unlock couple login (the couple's and every co-organizer login of the event) |
| `admin_couple_password_regenerated` | Events — regenerate couple password |
| `admin_plan_created` | Plans — create |
| `admin_plan_updated` | Plans — edit name/description/order/visibility |
| `admin_plan_features_saved` | Plans — feature/limit editor |
| `admin_plan_made_default` | Plans — make default |
| `admin_plan_deleted` | Plans — delete |
| `admin_message_status` | Messages — change status |
| `admin_message_deleted` | Messages — delete |
| `admin_maintenance_on` | System — turn maintenance mode on |
| `admin_maintenance_off` | System — turn maintenance mode off |

(Re-grep `"admin_` under `lib/admin/*-core.ts` if this list needs to be regenerated after future work — it's exhaustive as of Session 1/task 4.3. A plain `action: "admin_` grep misses `admin_maintenance_on`/`admin_maintenance_off`: `lib/admin/message-actions-core.ts`'s `setMaintenance` picks the action name with a ternary — `action: i.enabled ? "admin_maintenance_on" : "admin_maintenance_off"` — so the literal substring `action: "admin_` never appears for that line.)
