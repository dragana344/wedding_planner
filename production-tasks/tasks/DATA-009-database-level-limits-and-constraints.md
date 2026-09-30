# DATA-009 - Database-level limits and constraints

**Category:** data · **Priority:** P1 · **Effort:** M · **Depends on:** SEC-004

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Couple tables accept unbounded text: guest full_name/notes, notes, budget labels, agenda, locations, invitation message, contact_submissions (public!). Add check constraints (length caps well above real use, party_size between 1 and a sane max, non-empty names) so a bug or bypass of SEC-004 still cannot store megabytes or nonsense.

## Coachfio reference

Coachfio bounds every user-supplied field twice: in the request schema and in the column.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `migrations (check constraints)`
- `api/schemas.py (bounded fields)`

## Steps

Target files:

- `supabase/migrations/00xx_field_limits.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every free-text column written by couples or the public has a length check.
- [ ] Existing data satisfies the constraints (checked before adding).

## Verification

- insert a 1 MB note via the service role -> constraint error

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
