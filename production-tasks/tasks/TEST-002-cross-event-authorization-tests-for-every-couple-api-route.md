# TEST-002 - Cross-event authorization tests for every couple API route

**Category:** testing · **Priority:** P0 · **Effort:** M · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Couple routes use the service-role client (RLS bypassed), so authorization rests entirely on each lib function adding `.eq("event_id", eventId)`. A review found them all scoped today - pin it: for every couple route with an [id] param, create two events and assert that event A's session cannot read, update or delete event B's rows (guests, notes, budget, checklist + subtasks, agenda, locations, seating elements, menu quantities).

## Coachfio reference

Coachfio tests that one user can never read or change another's match, and that the refusal is a 404 so existence is not confirmed.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tests/test_reanalyze_needs_its_footage.py (_owned double)`
- `api/routes/matches.py (_owned: 404 not 403)`

## Steps

Target files:

- `tests/api/couple-authz.test.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every couple mutation route has a cross-event test.
- [ ] A deliberately removed event_id filter makes a test fail.

## Verification

- `npm run test:db -- couple-authz`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
