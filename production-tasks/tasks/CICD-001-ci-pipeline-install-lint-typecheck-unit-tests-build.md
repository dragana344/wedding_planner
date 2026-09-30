# CICD-001 - CI pipeline: install, lint, typecheck, unit tests, build

**Category:** ci-cd · **Priority:** P0 · **Effort:** M · **Depends on:** TEST-001, TEST-004

**Requires approval:** no · **Touches logic or frontend:** no

## Context

There is no CI. Add a GitHub Actions workflow on push/PR: `npm ci` (pinned Node from .nvmrc), lint, typecheck, test:unit, `next build` with dummy public env values. Cache npm.

## Coachfio reference

Coachfio runs lint and tests on every push and PR, pins its tool versions, and builds the exact artifact it deploys.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `.github/workflows/ci.yml`

Commits: `32bd54c`, `ffa2d6f`

## Steps

Target files:

- `.github/workflows/ci.yml (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every PR shows the workflow; a failing step blocks merge (CICD-006).

## Verification

- Open a PR with a type error -> CI red.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
