# TEST-003 - Venue RLS isolation tests across all venue tables

**Category:** testing · **Priority:** P1 · **Effort:** M · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Only 0004 has an RLS isolation test. Extend to every table staff read/write from the browser (rooms, table_types, menus, menu items, events, reservations, floor-plan layers, showcase, finance): staff of venue A cannot select/insert/update/delete venue B's rows, and anon can do nothing.

## Coachfio reference

Coachfio pins cross-tenant isolation on a real Postgres, not a mock.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tests/integration/ (real Postgres)`

## Steps

Target files:

- `tests/supabase/rls_isolation.test.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] For each venue table, cross-venue and anon access is denied by a test.

## Verification

- `npm run test:db -- rls_isolation`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
