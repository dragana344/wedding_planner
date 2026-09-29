# DATA-003 - Migration discipline: applied by pipeline, drift-checked

**Category:** data · **Priority:** P0 · **Effort:** S · **Depends on:** CICD-001, INFRA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Production schema must only change via `supabase db push` from CI (CICD-003), never via the dashboard SQL editor. Add a CI check that fails on duplicate migration numbers and on drift (`supabase db diff` against a fresh local apply must be empty). Adopt expand/contract for breaking changes so an app rollback never meets an incompatible schema (CICD-004).

## Coachfio reference

Coachfio changes schema only through versioned migrations applied automatically, never by hand, and learned (fc1b9ad) that two branches can claim the same migration number.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `migrations/`
- `api/main.py (init_db upgrades to head)`
- `CLAUDE.md (migration notes)`

Commits: `fc1b9ad`, `7b48fe2`

## Steps

Target files:

- `supabase/migrations/`
- `.github/workflows/ci.yml`
- `docs/production/MIGRATIONS.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] CI fails on duplicate migration prefixes and on schema drift.
- [ ] Dashboard SQL edits are forbidden by policy (documented).

## Verification

- `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d  # empty`
- `supabase db diff --linked  # empty`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
