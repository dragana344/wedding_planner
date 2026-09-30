# OBS-003 - Uptime checks and alerting

**Category:** observability · **Priority:** P1 · **Effort:** S · **Depends on:** REL-001, DATA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Monitor /api/health and the marketing page from outside (Better Stack, UptimeRobot, or Vercel checks) every 1-5 minutes, alert to email/Slack of named on-call people, and add a backup-freshness alert (DATA-001).

## Coachfio reference

Coachfio probes the host and the app every ten minutes and posts its COMPLETE findings, so a cleared problem resolves itself and a probe that cannot answer is itself an alert.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `scripts/alerts.sh`
- `admin/storage/alerts.py`

Commits: `115498e`, `eaac529`

## Steps

Target files:

- `docs/production/ALERTS.md (new)`
- `(uptime service config)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] An outage alerts a named person within 5 minutes.
- [ ] A stale backup alerts.

## Verification

- Take staging health down; receive the alert.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
