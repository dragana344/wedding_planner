# DATA-002 - Restore drill

**Category:** data · **Priority:** P1 · **Effort:** M · **Depends on:** DATA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Write and run a restore procedure: restore the latest dump into a scratch Supabase project/local instance, run migrations check and row-count sanity queries, restore a sample of storage objects. Schedule it monthly and record the result.

## Coachfio reference

Coachfio restores a real backup into a scratch database on a schedule and checks it, because the only proof a backup works is a restore.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tools/restore_drill.py`
- `scripts/restore_drill_monthly.sh`
- `.github/workflows/ci.yml (restore-drill job)`

Commits: `1792f7b`

## Steps

Target files:

- `docs/production/BACKUPS.md`
- `scripts/restore-drill.sh (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A documented restore completed successfully, with timing (RTO) and data age (RPO) recorded.

## Verification

- Run scripts/restore-drill.sh against the latest backup; compare row counts.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
