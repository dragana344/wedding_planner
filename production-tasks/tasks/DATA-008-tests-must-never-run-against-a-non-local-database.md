# DATA-008 - Tests must never run against a non-local database

**Category:** data · **Priority:** P0 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

vitest.setup.ts loads .env.local and the DB tests create and delete venues/users with the service-role key against whatever NEXT_PUBLIC_SUPABASE_URL says. Today it points at local Supabase, but one edited .env.local would run destructive tests against production. Add a guard in the setup that aborts unless the URL host is 127.0.0.1/localhost (or an explicit CI test project), and never allow the production service-role key on a laptop.

## Coachfio reference

Coachfio's test harness strips every settings env var so a test can never reach a real database by accident.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tests/conftest.py (isolated_settings)`
- `CLAUDE.md (green local != green CI)`

## Steps

Target files:

- `vitest.setup.ts`
- `tests/supabase/*.test.ts`
- `lib/supabase/resolve-client.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [x] Running tests with a non-local Supabase URL aborts before any test executes.

## Verification

- `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co npx vitest run  # aborts with a clear message`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
