# DATA-001 - Automated backups for database and storage

**Category:** data · **Priority:** P0 · **Effort:** M · **Depends on:** INFRA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Enable Supabase daily backups (and PITR if the plan allows). Supabase backups do NOT include Storage objects: add a scheduled off-site copy of the invitation/menu/showcase photo buckets and a weekly logical dump (pg_dump via the Supabase CLI) to storage outside the Supabase project. Record retention and who can restore.

## Coachfio reference

Coachfio takes scheduled database dumps, syncs them off the primary host, and alerts when the newest backup is too old - a backup nobody checks is not a backup.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `scripts/backup_db.sh`
- `scripts/backup_sync.sh`
- `scripts/backup_freshness.sh`

Commits: `1431ab7`, `f8d2584`

## Steps

Target files:

- `docs/production/BACKUPS.md (new)`
- `(Supabase project settings)`
- `.github/workflows/backup.yml (optional, new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Daily DB backups (and PITR if enabled) are on for production.
- [ ] Storage buckets are copied off-site on a schedule.
- [ ] Backup freshness is monitored (OBS-003).

## Verification

- Supabase dashboard -> Database -> Backups shows recent entries.
- List the off-site bucket: newest object < 36h old.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
