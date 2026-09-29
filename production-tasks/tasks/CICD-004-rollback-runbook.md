# CICD-004 - Rollback runbook

**Category:** ci-cd · **Priority:** P1 · **Effort:** S · **Depends on:** CICD-003

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Document how to roll the app back (host instant rollback), when a rollback is safe given migrations (expand/contract rule from DATA-003), and how to restore data (DATA-002). Rehearse once on staging.

## Coachfio reference

Coachfio keeps the previous images tagged so a bad release can be reverted in minutes, and keeps migrations backward compatible so a rollback is possible.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `DEPLOY.md`
- `docker images tagged pre-truth-*`

Commits: `1792f7b`

## Steps

Target files:

- `docs/production/DEPLOY.md`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A rollback on staging was performed from the runbook in under 10 minutes.

## Verification

- Rehearsal notes in the doc.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
