# 00 - Target overview: `wedding_planner`

Read-only survey, 27 Sep 2026, at commit `3de5d2a` ("Fix dashboard bugs"). The repository has 2 commits in total.

## What the product is

A wedding-venue platform in Macedonian with three audiences:

| Audience | How they get in | Where they work |
|---|---|---|
| **Venue staff** | Supabase Auth (email + password), self-serve signup at `/signup` | `/venue/*` panel: events, calendar, reservations, rooms, floor plans, tables, menus and packages, clients, reports, settings |
| **Couples** | Username + password created by their venue for one event (`event_credentials`), own cookie session | `/couple/*` panel: guests, budget, checklist, agenda, locations, menu, seating, notes, invitation |
| **Guests** | No account. The invitation link slug is the access token | `/invite/[slug]` public invitation + RSVP |

Plus a public marketing page at `/` with a contact form. No payments: per the spec in `docs/superpowers/specs/`, sales happen off-platform.

## Stack

| Layer | What |
|---|---|
| Framework | Next.js **14.2.35** (App Router), React 18, TypeScript 5 |
| Styling | Tailwind 3 plus hand-written CSS (`app/venue/panel.css`) |
| Data / auth / files | Supabase: Postgres, Auth, Storage (`@supabase/ssr` 0.12, `@supabase/supabase-js` 2) |
| Tests | Vitest 1.6 + Testing Library + jsdom; DB tests run against local Supabase |
| Lint | ESLint 8, `next/core-web-vitals` + `next/typescript` |
| Package manager | npm (`package-lock.json`); Node version not pinned |
| Other deps | `qrcode` |

## Structure

```
app/            routes: /, /login, /signup, /reset-password, /venue/*, /couple/*, /invite/[slug], /api/*
app/api/        30 route handlers: 27 under /api/couple, plus /api/invite/[slug]/rsvp, /api/venue/signup, /api/venue/contact
components/     client components per area (auth, couple, invite, marketing, venue)
lib/couple/     server-side domain logic for the couple panel (service-role client)
lib/venue/      venue domain logic (mostly browser client, RLS-bound)
lib/supabase/   browser, server (cookie) and service-role client factories
middleware.ts   couple session gate for /couple/* and /api/couple/*
supabase/       config.toml (local) + 30 SQL migrations
tests/          53 test files: lib, components, schema, RLS
docs/superpowers/  one spec + one plan (marketing page and self-serve signup)
```

## Data model (from migrations 0001-0030)

venues, venue_staff, rooms, table_types, floor-plan layers, menu templates and item pool (multi-tier prices, photos, allergens), events (+ event_rooms, schedule/status, finance, seating draft/confirmation, notes), reservations (with a status lifecycle), event_organizers, event_credentials and couple_sessions, couple tools (guests with side and RSVP, budget, checklist + subtasks, agenda, locations, custom menus, menu quantities, invitations), contact_submissions.

Storage buckets, all **public read**: `menu-item-photos`, `event-showcase-photos` (staff write, folder-scoped by venue), `invitation-photos` (written by the server with the service role).

## Auth and authorization model

- **Venue staff:** Supabase Auth. The venue panel reads and writes mostly **from the browser** with the anon key, so Row Level Security is the real gate. `is_venue_staff_for(venue_id)` (SECURITY DEFINER) backs the policies. Server layouts redirect to `/login` if there is no staff row. No middleware refreshes the Supabase session (see AUTH-001).
- **Couples:** `POST /api/couple/login` calls `verify_event_credentials` (bcrypt via pgcrypto, lockout after 5 failures for 15 minutes) and sets a random 32-byte `couple_session` cookie (HttpOnly, Secure, SameSite=Lax, 30 days, sliding). Middleware validates it on every request, renews it, strips any client-sent `x-couple-event-id` and injects the real one. Couple routes then use the **service-role client** (RLS bypassed); every write is scoped with `.eq("event_id", eventId)` - reviewed route by route, all scoped today.
- **Guests:** the invitation slug (9 random bytes, base64url) is the only credential. RSVP matches a submitted name to the guest list or creates a new guest.

Credential-management functions (`create_event_credentials`, `regenerate_event_password`, `get_event_username`) are granted to `authenticated` and check `is_venue_staff_for` inside.

## Configuration and secrets

`.env.local.example` lists three variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. `.env.local` exists on this machine, points at **local** Supabase, is git-ignored, and **no env file has ever been committed** (checked across all history). Values were not read.

## Build, test, lint, deploy

- Scripts: `dev`, `build`, `start`, `lint`, `test` (`vitest run`). No `typecheck` script.
- `vitest.setup.ts` loads `.env.local`; the DB tests create and delete rows with the service-role key against whatever URL it names.
- **No CI, no deploy configuration, no Dockerfile, no README, no health endpoint, no error tracking, no logging, no backups.**
- Working tree note: `package-lock.json` is modified and uncommitted (18+/148-) on this machine; `node_modules/` and `.next/` exist locally. None of this was created by this audit.

## Integrations

Supabase only. No email provider beyond Supabase Auth's built-in SMTP, no analytics, no payments, no Sentry.

## Frontend (for understanding only - no task changes it without approval)

Venue panel with an onboarding tour, calendar, floor-plan canvas editor and seating overlay; couple panel with the same seating editor in draft/confirm mode; eight invitation templates with countdown; marketing page with scroll reveal. Macedonian copy throughout (some English error strings in the auth flow).

## Decisions (27 Sep 2026)

| Topic | Decision | Tasks it shapes |
|---|---|---|
| Hosting | **Vercel** (Next.js app) + **Supabase Cloud** (DB, auth, storage) | INFRA-001, REL-002, CICD-003 |
| Domain | To be bought | INFRA-002 |
| Email | **Resend**, on a verified sending subdomain of the new domain | INFRA-006, SEC-012, AUTH-002, OBS-005 |
| Invitation photo size | **No product limit.** Vercel caps function request bodies at 4.5 MB, so uploads move to Supabase signed upload URLs; the only ceiling is the Storage platform maximum (50 MB default, raisable on Pro) | SEC-005 |
| Invitation photo formats | Decided by engineering: JPEG, PNG, WebP, GIF, AVIF (what every guest's browser can display). SVG refused (can carry script in a public bucket). iOS turns HEIC into JPEG on upload | SEC-005 |
| Privacy policy / terms | Macedonian **and** English, reviewed by a dedicated AI legal reviewer; the review is recorded | COMP-001 |

## Remaining assumptions

1. **Supabase Pro plan** for production (needed for daily backups, optional PITR, a raised upload ceiling and custom SMTP limits).
2. **Region:** EU for Supabase and Vercel functions (the users and their guests are in North Macedonia / Europe).
3. **Legal roles:** the venue is the data controller for its guests' data and the platform a processor - to be confirmed by the COMP-001 review.
4. **No payments at launch**, per the existing spec.

## Open questions

- **hosting:** is the Supabase **Pro** plan approved, and which **region**?
- **hosting:** is **Vercel Pro** approved? The Hobby plan does not allow commercial use (INFRA-007).
- **upgrade:** OK to plan the Next.js 14 -> 16 upgrade now? `npm audit` shows 1 critical + 1 high fixed only in 16.x (SEC-024).
- **RSVP:** may a guest who already answered change their answer through the public link, or only the couple (SEC-021)?
- **data:** how long is guest data kept after the wedding, and contact messages (DATA-007)?
- **data:** when a venue deletes its account, is anything kept (e.g. anonymised reservation/finance history) (DATA-005)?
- **security:** OK to log couples out when a venue regenerates their password (SEC-009)?
- **security:** how should the floor-plan lock code be set for new venues instead of the shared '0000' (SEC-010)?
- **team:** who receives alerts (OBS-003) and contact-form messages (OBS-005)?
- **legal (note):** an AI review catches inconsistencies well, but it does not carry a lawyer's liability. Holding third parties' data (guests), a one-time human legal check before launch is worth considering.
