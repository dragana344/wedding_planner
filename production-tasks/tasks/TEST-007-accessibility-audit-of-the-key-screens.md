# TEST-007 - Accessibility audit of the key screens

**Category:** testing · **Priority:** P2 · **Effort:** M · **Depends on:** TEST-005

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Run axe via Playwright on login, signup, venue dashboard, couple guests, invitation and RSVP; record violations. Fixes that change markup are separate, approved changes.

## Coachfio reference

Coachfio runs an automated accessibility test in CI and keeps a dated audit.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `admin-ui/src/a11y.test.tsx`
- `docs/accessibility-2026-08-29.md`

## Steps

Target files:

- `e2e/a11y.spec.ts (new, axe)`
- `docs/production/ACCESSIBILITY.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] An axe report exists for each screen and runs in CI (warn, then fail on serious).

## Verification

- `npx playwright test e2e/a11y.spec.ts`

## Out of scope

- Fixing findings in this task.
