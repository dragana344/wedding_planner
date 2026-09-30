# SEC-011 - Dependency and secret scanning in CI

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** CICD-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Add a gitleaks (or trufflehog) job over the full history, `npm audit --omit=dev --audit-level=high` as a failing step, and Dependabot (npm + github-actions, weekly, grouped).

## Coachfio reference

Coachfio has a reproducible lock, a secret-scan job and vulnerability scanning in CI, so a leaked key or a known-vulnerable dependency fails the build.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `.github/workflows/ci.yml (secret-scan job)`
- `uv.lock`

Commits: `6dc267f`, `5e7b5c9`, `3bebf2e`

## Steps

Target files:

- `.github/workflows/ci.yml`
- `.github/dependabot.yml (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] CI fails on a committed secret or a high/critical production vulnerability.
- [ ] Dependabot opens update PRs.

## Verification

- Push a branch containing a fake key -> secret-scan job red.
- `npm audit --omit=dev --audit-level=high`

## Out of scope

- Upgrading major versions as part of this task.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
