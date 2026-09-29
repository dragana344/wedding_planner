# DATA-007 - Retention and cleanup jobs

**Category:** data · **Priority:** P1 · **Effort:** M · **Depends on:** DATA-005

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Retention periods for guest data and contact messages are a business/legal decision.

## Context

Nothing is ever deleted today: expired couple_sessions accumulate, contact_submissions grow forever, guest data persists years after the wedding, and every invitation photo re-upload leaves the old object in the bucket (path includes a timestamp, upsert only overwrites the same path). Define periods (to confirm), implement pg_cron jobs, and sweep orphaned storage objects.

## Coachfio reference

Coachfio states retention periods in its privacy policy and enforces them in code, with a test holding the policy and the code together.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tests/test_retention_matches_the_policy.py`
- `core/support/ (12-month sweep)`

Commits: `a2bfd32`, `fca039d`

## Steps

Target files:

- `supabase/migrations/00xx_retention_jobs.sql (new, pg_cron)`
- `docs/production/RETENTION.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Expired sessions deleted daily.
- [ ] Orphaned invitation photos removed.
- [ ] Retention periods documented and matching COMP-001's policy text.

## Verification

- `select count(*) from couple_sessions where expires_at < now();  -- 0 after the job`
- Storage object count == referenced photo_path count

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
