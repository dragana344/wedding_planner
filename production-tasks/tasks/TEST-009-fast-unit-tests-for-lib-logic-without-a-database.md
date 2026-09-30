# TEST-009 - Fast unit tests for lib logic without a database

**Category:** testing · **Priority:** P2 · **Effort:** M · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Measured 27 Sep 2026: with no database, 20 of 52 test files pass and all 32 files covering lib/ fail - every piece of domain logic (RSVP matching, seating, reservations overlap, menus, budget) is only ever tested against a live Supabase. Keep those as integration tests, and add pure unit tests for the decision logic (e.g. rangesOverlap, RSVP matching, seating draft mutations) with a stubbed client.

## Coachfio reference

Coachfio tests its pipeline logic offline with scripted doubles, so the core logic runs in seconds on any machine.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tests/test_stages.py (offline-scripted model, no API key)`

## Steps

Target files:

- `tests/lib/**/*.test.ts`
- `tests/helpers/supabase-stub.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] The pure logic in lib/ has unit tests that pass with Supabase stopped.

## Verification

- `supabase stop && npm run test:unit`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
