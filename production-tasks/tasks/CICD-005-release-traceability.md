# CICD-005 - Release traceability

**Category:** ci-cd · **Priority:** P2 · **Effort:** S · **Depends on:** REL-001, OBS-001, CICD-003

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Expose the release SHA in /api/health and Sentry; add a scheduled check that the live SHA is an ancestor of origin/main (catches hand-deploys of unreviewed code).

## Coachfio reference

Coachfio can always answer 'which commit is live' from the outside.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tools/deploy_binding.py`
- `Dockerfile (GIT_SHA)`

Commits: `40c30f7`, `1d0a8c8`

## Steps

Target files:

- `app/api/health/route.ts`
- `.github/workflows/ci.yml`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] /api/health release == deployed commit; the scheduled check alerts on mismatch.

## Verification

- `curl /api/health vs git rev-parse origin/main`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
