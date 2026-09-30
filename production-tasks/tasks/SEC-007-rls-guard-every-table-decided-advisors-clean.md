# SEC-007 - RLS guard: every table decided, advisors clean

**Category:** security · **Priority:** P1 · **Effort:** M · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

All 30 migrations enable RLS today (verified). Keep it that way: add a DB test that lists every table in public and fails if one lacks RLS, plus a table-by-table expectation (service-role-only vs. which policies) so a new table must be classified. Run the Supabase security advisor against the production project and fix or document every finding.

## Coachfio reference

Coachfio has guard tests that fail the build when a new table or route appears without an explicit decision (an erasure rule, a host-gate prefix), so coverage cannot silently rot.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tests/test_erasure.py (guard test)`
- `tests/test_admin_routes.py`

Commits: `32bd54c`

## Steps

Target files:

- `tests/supabase/rls_guard.test.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A new table without RLS makes the test suite fail.
- [ ] Supabase security advisor: zero unresolved findings.

## Verification

- `npm run test:db`
- Supabase dashboard -> Advisors -> Security

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
