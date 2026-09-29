# INFRA-004 - README, Node version pin and lockfile policy

**Category:** infra · **Priority:** P1 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Add a README: prerequisites, `supabase start`, env setup from .env.local.example, `npm run dev`, how to run unit vs DB tests (TEST-001), how to deploy (CICD-003). Pin Node with .nvmrc and package.json `engines`. Decide the lockfile policy: package-lock.json is committed and CI uses `npm ci` (the working tree currently has an uncommitted lockfile change - resolve it deliberately, do not discard it blindly).

## Coachfio reference

Coachfio has a run-it-first SETUP.md and an architecture/gotchas file; a new engineer can go from clone to green tests without asking anyone. Toolchain versions are pinned.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `SETUP.md`
- `CLAUDE.md`

## Steps

Target files:

- `README.md (new)`
- `package.json`
- `.nvmrc (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A clean clone + README steps reaches a running app and a green unit test run.
- [ ] `node -v` mismatch is caught by engines/.nvmrc.
- [ ] package-lock.json is clean and CI uses npm ci.

## Verification

- Fresh clone into /tmp, follow README verbatim.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
