# REL-007 - Maintenance mode and status communication

**Category:** reliability · **Priority:** P2 · **Effort:** S · **Depends on:** OBS-003

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Adds a user-visible maintenance page.

## Context

An env flag that serves a static maintenance page (503 + Retry-After) to everyone except the team, for migrations that need downtime; plus a public status page link from the uptime provider.

## Coachfio reference

Coachfio can close the site to the public with one switch while the team keeps access.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `deploy/gate/on.caddy (preview gate)`

## Steps

Target files:

- `middleware.ts`
- `docs/production/INCIDENTS.md`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Setting the flag shows the maintenance page within one deploy/edge-config change.

## Verification

- Toggle on staging.

## Out of scope

- Designing a new page beyond a minimal notice.
