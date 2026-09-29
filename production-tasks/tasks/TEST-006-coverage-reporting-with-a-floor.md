# TEST-006 - Coverage reporting with a floor

**Category:** testing · **Priority:** P2 · **Effort:** S · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Enable v8 coverage for lib/ and app/api/, publish the report in CI, and set a floor at the measured baseline (ratchet up over time).

## Coachfio reference

Coachfio enforces a coverage floor so coverage cannot quietly erode.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `pyproject.toml (coverage floor)`

Commits: `a1d5028`

## Steps

Target files:

- `vitest.config.ts`
- `package.json`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] CI shows coverage and fails below the floor.

## Verification

- `npm run test:unit -- --coverage`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
