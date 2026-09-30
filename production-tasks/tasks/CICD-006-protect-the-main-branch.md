# CICD-006 - Protect the main branch

**Category:** ci-cd · **Priority:** P1 · **Effort:** S · **Depends on:** CICD-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Require PRs and green CI to merge into main, block force-push and deletion.

## Coachfio reference

Coachfio deploys only reviewed code from main.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `CLAUDE.md (no autocommit, reviewed deploys)`

## Steps

Target files:

- `(GitHub repository settings)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Direct push to main is refused; a red CI blocks merge.

## Verification

- Try a direct push to main.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
