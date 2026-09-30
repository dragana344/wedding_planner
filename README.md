# Wedding Planner

A wedding-venue platform (Macedonian UI) with three audiences:

- **Venue staff** sign up at `/signup` and work in `/venue/*`: events, calendar, reservations, rooms and floor plans, menus, clients, reports.
- **Couples** log in at `/couple/login` with a username and password their venue creates for one event, and plan in `/couple/*`: guests, budget, checklist, seating, menu, invitation.
- **Guests** open `/invite/<slug>` and RSVP. No account; the link is the credential.

Stack: Next.js 14 (App Router), React 18, TypeScript, Tailwind, Supabase (Postgres, Auth, Storage). Hosting: Vercel + Supabase Cloud. See [docs/production/](docs/production/).

## Prerequisites

- **Node 22** (`.nvmrc`; `npm` refuses other versions via `engine-strict`). With nvm: `nvm install && nvm use`.
- **Docker** — only for the database test suite (local Supabase). Not needed to run the app against a cloud project.
- The Supabase CLI comes in as a dev dependency (`npx supabase …`).

## Setup

```bash
npm ci
cp .env.local.example .env.local
```

Fill `.env.local` with the Supabase project you develop against:

| Variable | Where from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API, or `npx supabase status` for a local instance |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable (`sb_publishable_…`) or legacy anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret (`sb_secret_…`) or legacy service_role key. Server-only, never commit it |

Full list and rotation steps: [docs/production/SECRETS.md](docs/production/SECRETS.md).

### Option A: a local database

```bash
npx supabase start          # Docker; applies supabase/migrations/* and supabase/seed.sql
npx supabase status         # URL and keys for .env.local
npm run dev                 # http://localhost:3000
```

The seed is synthetic (never production data): staff login `demo@example.com` / `demo-password-123`, couple login `demo-couple` / `demo-couple-123`.

### Option B: a cloud project

Point `.env.local` at a **non-production** Supabase project, then `npm run dev`. Never put production keys in `.env.local` (see DATA-010).

## Tests and checks

| Command | What | Needs |
|---|---|---|
| `npm run test:unit` (= `npm test`) | Components and pure logic | Nothing: no network, no database |
| `npm run test:db` | Schema, RLS, and DB-backed `lib/` code | `npx supabase start`. Writes `.env.test.local` from `supabase status` |
| `npm run typecheck` | `tsc --noEmit` | |
| `npm run lint` | `next lint`, zero warnings allowed | |

Tests refuse to run against any non-local Supabase URL: the DB suite creates and deletes rows with the service-role key. For a clean DB run: `npx supabase db reset --local && npm run test:db`.

## Database changes

Add a new file in `supabase/migrations/` (next number, never edit one that has been applied to production), verify locally with `npx supabase db reset --local && npm run test:db`, then apply to the linked project with `npx supabase db push`. See [docs/production/DEPLOY.md](docs/production/DEPLOY.md).

## Deploying

Vercel project `wedding-planner`, functions in `dub1` next to Supabase (`eu-west-1`). See [docs/production/DEPLOY.md](docs/production/DEPLOY.md) and [docs/production/HOSTING.md](docs/production/HOSTING.md).

## Dependencies

`package-lock.json` is committed and is the source of truth; CI installs with `npm ci`. Change dependencies only with `npm install <pkg>` on Node 22 and commit the lockfile in the same change.
