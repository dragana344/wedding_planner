# TEST-001 - Split unit and database tests; make both runnable from scripts

**Category:** testing · **Priority:** P0 · **Effort:** M · **Depends on:** DATA-008

**Requires approval:** no · **Touches logic or frontend:** no

## Context

`npm test` currently runs everything, including tests/supabase/* and lib tests that need a running local Supabase. Add `test:unit` (no network, no DB - default in CI) and `test:db` (requires `supabase start`, runs tests/supabase and DB-backed lib tests), and `typecheck` (`tsc --noEmit`). Measured baseline 27 Sep 2026 (production build, placeholder env): with no database 20 of 52 files / 91 of 114 tests pass; all tests/supabase/* and every tests/lib/* file need a live database. Put the 20 in test:unit and the 32 in test:db.

## Coachfio reference

Coachfio's default test run needs no services; database-backed tests are a separate, explicitly-run suite with their own CI job - and the notes record how a green local run hid a red CI run three times.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `pyproject.toml (addopts -m 'not integration')`
- `.github/workflows/ci.yml (integration job)`

Commits: `f76dc49`

## Steps

Target files:

- `package.json`
- `vitest.config.ts`
- `vitest.db.config.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [x] `npm run test:unit` passes with Supabase stopped.
- [x] `npm run test:db` passes against a fresh `supabase start && supabase db reset`.

## Verification

- `supabase stop && npm run test:unit`
- `supabase start && supabase db reset && npm run test:db`

## Out of scope

- Changing test assertions.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
