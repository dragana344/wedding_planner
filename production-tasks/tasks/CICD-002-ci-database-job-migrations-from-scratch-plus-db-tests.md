# CICD-002 - CI database job: migrations from scratch plus DB tests

**Category:** ci-cd · **Priority:** P1 · **Effort:** M · **Depends on:** CICD-001, TEST-002, TEST-003

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Add a job that runs `supabase start`, `supabase db reset` (applies all migrations from zero - catches a migration that only works on an existing DB), `supabase db lint`, then `npm run test:db`.

## Coachfio reference

Coachfio runs integration tests against real services in their own CI job, because the API-shape and SQL tests are exactly what a mock hides.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `.github/workflows/ci.yml (integration job with real services)`

Commits: `f76dc49`

## Steps

Target files:

- `.github/workflows/ci.yml`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Migrations apply cleanly from scratch in CI.
- [ ] DB and authorization tests run on every PR.

## Verification

- CI job log shows db reset + test:db green.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
