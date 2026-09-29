# DATA-010 - Never copy production personal data into staging or laptops

**Category:** data · **Priority:** P1 · **Effort:** S · **Depends on:** REL-002

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Write the rule down and make it easy to follow: a synthetic seed for local and staging (venues, events, fake guests), and a documented prohibition on restoring production dumps anywhere but the restore drill's isolated project.

## Coachfio reference

Coachfio keeps production data on the production box; tests and development never need it.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tests/conftest.py (isolated settings)`

## Steps

Target files:

- `docs/production/ENVIRONMENTS.md`
- `supabase/seed.sql (new, synthetic)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] `supabase db reset` loads a realistic synthetic dataset.
- [ ] The rule is in ENVIRONMENTS.md.

## Verification

- `supabase db reset && open Studio`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
