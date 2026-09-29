# TEST-005 - End-to-end smoke tests for the critical flows

**Category:** testing · **Priority:** P1 · **Effort:** M · **Depends on:** TEST-001, CICD-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Add Playwright smoke tests against a local build + local Supabase: venue signup -> dashboard; venue creates event and couple credentials; couple logs in and adds a guest; public invitation page loads and an RSVP is recorded; password-reset request. Run in CI on main.

## Coachfio reference

Coachfio checks the real behaviour of each critical page with component tests in CI, and the shipped bytes with the build.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `web/ (vitest component tests)`
- `admin-ui/src/a11y.test.tsx`

## Steps

Target files:

- `e2e/*.spec.ts (new, Playwright)`
- `playwright.config.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] The five flows pass in CI.
- [ ] A broken login or RSVP fails CI.

## Verification

- `npx playwright test`

## Out of scope

- Visual regression.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
