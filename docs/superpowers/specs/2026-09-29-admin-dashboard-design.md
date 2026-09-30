# Platform admin dashboard and plan entitlements — design

Date: 2026-09-29 · Status: approved in conversation, awaiting written-spec review

## 1. Goal

Give the person responsible for the product (the platform owner — not a venue manager) one place to oversee and support every venue, and to decide which features each venue and each event gets. Venues keep doing their own day-to-day work in `/venue`; the admin does not enter venue data for them.

Success:
- The owner signs in at `admin.<domain>` (email + password + mandatory TOTP) and can see and act on every venue, event, venue-staff account, contact message and audit entry.
- The owner builds plans ("tiers", like roles): named sets of feature switches and limits. Every venue has a plan; every event inherits its venue's features; the owner can unlock or lock individual features and change limits per venue and per event (negotiated extras).
- A locked feature is refused by the server and the database, not only hidden in the UI.
- No guest or couple planning data is ever shown in the admin dashboard (decision (a)).
- Deploying this changes nothing for existing venues: they start on a plan with everything unlocked.

## 2. Decisions taken

| # | Decision |
|---|---|
| D1 | Purpose: product oversight + support, not doing venues' work. |
| D2 | Privacy level (a): venue/event level only. Never guests (`event_guests`), couples' notes, budget, checklist, agenda, locations, invitation message/photo, custom menu choices, seating drafts, contact details of couples/guests on reservations. Couple names (on the event) and venue staff emails are shown. |
| D3 | One admin account, TOTP mandatory. Admins are never venue staff and vice versa. |
| D4 | Approach A: same Next.js app and Vercel project; `admin.<domain>` is routed by `proxy.ts` to `app/admin/*`; `/admin` on the main domain is 404. |
| D5 | Every feature listed in §5 can be locked/unlocked; the owner builds plans in the dashboard. Features are fixed in code; plans and their contents are data. |
| D6 | Resolution order: event override → venue override → venue's plan → locked. |
| D7 | Locking or lowering a limit never deletes data; existing data stays readable, new additions are refused. |
| D8 | A blocked venue's staff and couples lose access; public invitations and RSVP keep working. |

## 3. Architecture

### 3.1 Routing

- `proxy.ts` reads the `Host` header (`x-forwarded-host` on Vercel). If the host starts with `admin.` (production `admin.<domain>`, local `admin.localhost:3000`), every path is rewritten to `/admin/<path>`; requests for `/admin/*` on any other host get 404. The existing couple/venue/CSRF/maintenance logic runs unchanged for the main host.
- The admin host needs no other proxy work: admin pages and actions authenticate themselves (§3.3). The maintenance page (REL-007) never applies to the admin host, so maintenance can be switched off from it.
- Vercel: add `admin.<domain>` as a domain of the same project. Supabase Auth: add `https://admin.<domain>/**` to the redirect URLs.
- Cookies are host-only, so admin and venue sessions never share cookies.

### 3.2 Admin identity

- An admin is a Supabase Auth user with `app_metadata.role = "platform_admin"`. `app_metadata` can only be written with the service-role key; `scripts/make-admin.mjs <email>` sets it (creating the user with a random password and a password-reset email if needed). There is exactly one admin for now (D3), but nothing in the design prevents more.
- An admin must never be venue staff: a trigger on `venue_staff` refuses inserting a user whose `raw_app_meta_data->>'role' = 'platform_admin'`, and `make-admin.mjs` refuses a user who has a `venue_staff` row. The venue layout already redirects users with no staff row, so an admin opening `/venue` sees `/login`.

### 3.3 Admin authentication and the single guard

- `app/admin/login`: email + password (Supabase Auth), then TOTP. If the admin has no verified factor yet, the enrolment screen (reusing `MfaSettings` building blocks and `MfaCodeForm`) is mandatory before anything else.
- `lib/admin/guard.ts` exports `requireAdmin()`: used by the admin layout and at the start of every admin server action. It
  1. reads the session with the server Supabase client;
  2. requires JWT `aal = aal2`;
  3. calls `auth.getUser()` (Auth server, not the cookie) and requires `app_metadata.role === "platform_admin"`;
  4. fails closed on any error (redirect to `/admin/login` for pages, throw for actions);
  5. returns `{ adminUserId, requestId }`.
- Admin reads and writes use the service-role client only inside `lib/admin/*` and `app/admin/*`, after `requireAdmin()`. A unit test asserts every exported server action in `app/admin/**/actions.ts` calls `requireAdmin()` first (static check of the source), and a DB-suite test asserts no module under `lib/admin/` or `app/admin/` references the private tables of D2.

### 3.4 Audit

- Migration extends `audit_log.actor_type` with `'admin'`.
- Every admin mutation writes one row through `recordAudit()` with `actorType: "admin"`, `actorId`, `venueId`/`eventId`/`targetId`, `requestId`, and `details` without personal data (e.g. `{ plan_from, plan_to }`, `{ feature, enabled, limit }`, `{ reason_length }`, never free text other than the owner's own override notes, which stay in the override tables).

## 4. Entitlements

### 4.1 Feature catalogue (code)

`lib/entitlements/features.ts` — the single source of feature keys, Macedonian labels, scope and type:

| Key | Scope | Type | Gates |
|---|---|---|---|
| `invitation` | event | switch | couple invitation page, public link generation; the public `/invite/<slug>` page |
| `invitation_all_templates` | event | switch | templates beyond the first two |
| `invitation_photo` | event | switch | invitation photo upload |
| `seating` | event | switch | couple seating editor and its API routes |
| `custom_menu` | event | switch | custom menu mode (template choice stays available) |
| `budget` | event | switch | budget page + routes |
| `checklist` | event | switch | checklist page + routes |
| `agenda` | event | switch | agenda page + routes |
| `locations` | event | switch | locations page + routes |
| `notes` | event | switch | notes page + routes |
| `max_guests` | event | limit | guests per event (couple adds + public RSVP creates) |
| `reservations` | venue | switch | reservations module (create/update) |
| `floor_plan` | venue | switch | floor-plan editor (fixed/layout element writes) |
| `showcase_photos` | venue | switch | event showcase photo uploads |
| `max_rooms` | venue | limit | rooms per venue |
| `max_active_events` | venue | limit | events per venue with status not in (completed, cancelled) |
| `reports` | venue | switch | reports page (placeholder today) |

A limit of `null` means unlimited. The same key list is mirrored in the database as a check constraint on the feature-key columns, and a unit test keeps code and migration in sync.

### 4.2 Tables (migration)

- `plans(id uuid pk, name text unique, description text, sort_order int, is_default bool, created_at)`, with a partial unique index so at most one plan is default.
- `plan_features(plan_id → plans on delete cascade, feature_key text, enabled bool not null, limit_value int null, pk(plan_id, feature_key))`.
- `venues.plan_id uuid not null → plans` (restrict delete). `provision_venue` assigns the default plan.
- `venue_feature_overrides(venue_id → venues cascade, feature_key, enabled bool null, limit_override bool not null default false, limit_value int null, note text ≤ 1000, updated_at, updated_by uuid, pk(venue_id, feature_key))`. `enabled null` = keep the inherited switch. `limit_override false` = keep the inherited limit; `limit_override true` = use `limit_value` (null = unlimited).
- `event_feature_overrides(event_id → events cascade, …same columns…)`.
- `venues.blocked_at timestamptz null`, `venues.blocked_reason text null ≤ 1000`.
- All new tables: RLS on, no policies for `anon`/`authenticated` except read of the resolved features (§4.3); service_role full; classified in `rls_guard.test.ts` and `privacy-classification.ts`.
- Seed data in the migration: plan "Стандарден" (default) with every switch enabled and every limit unlimited; every existing venue assigned to it.

### 4.3 Resolution (one function)

- `public.effective_features(p_venue_id uuid, p_event_id uuid default null) returns table(feature_key text, enabled bool, limit_value int)` — SQL, stable, security definer, pinned search_path. For venue-scope keys: venue override → plan. For event-scope keys (when `p_event_id` given): event override → venue override → plan. Missing anywhere → locked (`enabled false`, limit 0).
- Helpers: `public.event_has_feature(event_id, key) bool`, `public.venue_has_feature(venue_id, key) bool`, `public.feature_limit(venue_id, event_id, key) int` (null = unlimited).
- Grants: `authenticated` may execute `effective_features` only for venues it is staff of (the function checks `is_venue_staff_for` when the caller is not service_role); service_role unrestricted. Couples never call it directly — server routes do.

### 4.4 Enforcement

| Where | Mechanism |
|---|---|
| Couple API routes | `withCoupleEvent(handler, { feature: "seating" })`: before the handler, one `event_has_feature` RPC; locked → 403 `{ error: "Оваа функција не е вклучена во вашиот пакет." }`. Every couple route gets its feature key (routes for guests/contact-info/guest-count/menu-template choice are ungated). |
| Couple pages | `app/couple/(protected)/layout.tsx` loads the event's effective features once and passes them to `CoupleShell` (lock icon + "Наскоро"-style locked page for gated pages). |
| Limits | Triggers: `event_guests` before insert (count vs `max_guests`), `rooms` before insert (`max_rooms`), `events` before insert/update of status (`max_active_events`). Error `P0001` with the Macedonian limit message, e.g. „Достигнат е лимитот од 150 гости за овој настан.“ |
| Venue features used from the browser | Triggers (before insert/update) on `reservations`/`reservation_tables` (`reservations`), `room_fixed_elements`/`room_layout_elements` (`floor_plan`), `event_showcase_photos` (`showcase_photos`); deletes are always allowed (D7). |
| Invitation | `invitation` locked → the couple cannot create or change the invitation (routes refuse); an invitation link that already exists keeps working for guests (D7: nothing already sent breaks). `invitation_all_templates` locked → PUT with a template outside the first two refused (an existing template stays). `invitation_photo` locked → the signed-upload route refuses (an existing photo stays). |
| Venue pages | `app/venue/layout.tsx` loads the venue's effective features; nav items for locked features show a lock and lead to a locked page. |
| Service role | Triggers apply to every role, so server code cannot bypass limits by accident. |

Blocked venues (D8): `is_venue_staff_for` additionally requires `venues.blocked_at is null`; `validateAndRenewCoupleSession` refuses sessions of events whose venue is blocked (the couple login page shows „Пристапот е привремено оневозможен.“); `/invite` and RSVP are unaffected.

## 5. Admin screens

All under `app/admin/`, styled with the existing panel CSS and components; Macedonian UI.

1. **Преглед** — counts: venues (total; active = at least one staff member signed in within 30 days, from `auth.users.last_sign_in_at`), new signups per week (8 weeks), events in the next 30 days, unread contact messages; latest 20 admin audit entries.
2. **Сали** — table (name, plan, created, staff count, events, last activity, status), search, plan filter. **Сала детали**: rename; plan select; feature overrides (table of all venue- and event-scope features showing the resolved value and source — plan/override — with switch/limit inputs and a note); staff list (email, MFA yes/no, last sign-in) with actions *send password reset*, *remove MFA factors*, *sign out everywhere*; rooms; events; *block/unblock* with reason; *delete account* (type the venue name; uses `delete_venue_account`).
3. **Настани** — table across venues (date, venue, couple names, type, status, guest estimate), filters by venue/date/status. **Настан детали**: edit date, times, status; event feature overrides ("бенефиции") with note; couple access: unlock a locked couple login, regenerate the couple password (shown once).
4. **Нивоа** — list, create, edit (name, description, order, default), per-feature switches/limits, delete only if no venue uses it.
5. **Контакт пораки** — list, mark read/answered (new columns `status`, `handled_at`), delete. (Contact messages are the platform's own data, not a venue's.)
6. **Audit log** — all entries, filters (venue, event, action, actor type, date range), paginated.
7. **Систем** — maintenance mode on/off stored in a new `platform_settings` row (the proxy reads it with a 30-second in-memory cache; the env flag from REL-007 still wins), current release SHA.

Admin mutations are Next.js Server Actions in `app/admin/**/actions.ts`, each: `requireAdmin()` → zod-validate input → service-role write (or existing RPC) → `recordAudit()` → `revalidatePath`.

## 6. Error handling

- Same rules as the API: intentional Macedonian messages reach the UI; database/auth errors become a generic „Акцијата не успеа.“ and are logged with the request id.
- Entitlement and limit refusals carry their specific message (§4.4) end to end: DB trigger → PostgREST error → `isUserFacingError`-style mapping for code `P0001` with our message → UI.
- `requireAdmin()` fails closed.

## 7. Testing

- **DB:** `effective_features` for every combination (plan only, venue override on/off, event override on/off, limits, missing plan rows); each limit and feature trigger for staff (browser role) and service role; blocked venue → no RLS data, couple session refused, RSVP still works; `app_metadata.role` cannot be set by the user (`auth.updateUser` data ignored); admin-cannot-be-staff trigger; default plan assigned on signup; migration leaves existing venues fully unlocked.
- **Access:** non-admin, admin without aal2, and admin with aal2 against every admin page/action; `/admin/*` on the main host → 404; static check that every admin action calls `requireAdmin()` first; static check that admin code never references the private tables of D2.
- **Unit/component:** feature catalogue ↔ migration key list; plan editor, override editor, typed-confirmation delete; couple and venue nav lock rendering.
- **E2E:** admin signs in with TOTP → creates plan "Basic" without `seating` → assigns it to a venue → that venue's couple sees the lock and the seating route answers 403 → admin unlocks `seating` for one event → that couple can use it. Plus: `admin.localhost` routing, `/admin` 404 on main host, CSP clean on admin pages.
- All existing suites stay green (the default plan unlocks everything).

## 8. Delivery phases

1. **Foundation:** host routing, admin login with mandatory TOTP, `requireAdmin()`, `make-admin.mjs`, admin actor in audit, admin-not-staff trigger.
2. **Entitlements:** catalogue, tables, default plan + backfill, `effective_features`, triggers, wrapper option, couple/venue lock UI, blocked venues.
3. **Admin screens:** overview, venues (incl. overrides, staff actions, block, delete), events (incl. benefits, couple access), plans.
4. **Rest:** contact messages, audit viewer, system/maintenance, E2E.

Each phase ends green (typecheck, lint, unit, DB, E2E) and gets its own commit commands.

## 9. Out of scope

- Payments/billing for plans (plans are assigned by hand after an off-platform sale).
- Multiple admins with different roles (the model allows adding admins later).
- Showing or editing guest/couple planning data (D2).
- Impersonating a venue or couple.
- Email notifications to venues about plan changes.
