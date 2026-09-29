# ARCH-002 - Remove the unused organizer feature from the schema

**Category:** architecture · **Priority:** P2 · **Effort:** S · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

event_organizers, is_organizer_for_event() and their policies were replaced by couple credentials (0013) and nothing in lib/, app/ or components/ uses them. They still grant a table to anon/authenticated and a SECURITY DEFINER function. Drop them after confirming the table is empty in production.

## Coachfio reference

Coachfio deletes a replaced mechanism instead of leaving a second path to maintain and secure.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `CLAUDE.md (deleted pipeline removed, not kept 'just in case')`

## Steps

Target files:

- `supabase/migrations/0010_event_organizers.sql, 0011 (reference)`
- `supabase/migrations/00xx_drop_event_organizers.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] The table, function and policies are gone; all tests pass.

## Verification

- `select count(*) from event_organizers; -- 0 before dropping`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
