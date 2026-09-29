# DATA-012 - Database-level protection against double booking

**Category:** data · **Priority:** P1 · **Effort:** M · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Table conflicts are checked in JavaScript (read existing reservations, then insert). Two staff members booking the same table for overlapping times at the same moment both pass the check. Add an exclusion constraint (btree_gist) over (table, time range) - the range must be a real tstzrange because events may run past midnight (migration 0015) - so the second insert fails and the UI shows the existing conflict message.

## Coachfio reference

Coachfio makes the database enforce invariants that two concurrent requests could otherwise both pass (e.g. the atomic usage charge).

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/storage/usage.py (atomic conditional update instead of read-then-write)`

## Steps

Target files:

- `lib/venue/reservations.ts (conflict check ~line 263)`
- `supabase/migrations/00xx_reservation_no_overlap.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Two concurrent overlapping bookings of the same table: exactly one succeeds.
- [ ] Existing non-overlapping bookings and overnight events still work.

## Verification

- Run two inserts in parallel in a DB test -> one exclusion_violation

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
