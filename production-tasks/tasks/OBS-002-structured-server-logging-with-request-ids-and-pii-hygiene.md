# OBS-002 - Structured server logging with request ids and PII hygiene

**Category:** observability · **Priority:** P1 · **Effort:** M · **Depends on:** ARCH-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Add a small JSON logger (level, msg, request_id, route, status, duration_ms) used by the route wrapper; generate/propagate a request id header. Log security-relevant events (login success/failure, lockout, password regenerate, account delete) without passwords, tokens or guest data.

## Coachfio reference

Coachfio logs through one logger, never logs tokens or personal data, and audits sensitive reads/writes by count rather than by copying the data into logs.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/observability.py`
- `admin/storage/audit.py (counts only, never contents)`

Commits: `935a47d`

## Steps

Target files:

- `lib/log.ts (new)`
- `lib/api/handler.ts`
- `middleware.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every API request produces one structured log line with request_id.
- [ ] Grep of logs for a known test password/token/guest name finds nothing.

## Verification

- Run the flows on staging and inspect host logs.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
