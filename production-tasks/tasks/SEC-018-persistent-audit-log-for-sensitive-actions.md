# SEC-018 - Persistent audit log for sensitive actions

**Category:** security · **Priority:** P1 · **Effort:** M · **Depends on:** OBS-002

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Logs rotate and are not queryable by venue. Add an append-only audit_log table (service-role insert only, no update/delete) for: couple credential create/regenerate, event delete, guest bulk changes, data export/erasure, staff sign-in failures and MFA changes. Actor, action, target id, time, request id - no guest names or contact details.

## Coachfio reference

Coachfio writes an audit row for every sensitive read or write, with the actor and counts only - never a copy of the data - so 'who did this' has an answer months later.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `admin/storage/audit.py`
- `commit 935a47d`

Commits: `935a47d`

## Steps

Target files:

- `supabase/migrations/00xx_audit_log.sql (new)`
- `lib/audit.ts (new)`
- `lib/venue/credentials.ts`
- `lib/venue/events.ts`
- `lib/privacy/*.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Each listed action writes exactly one audit row.
- [ ] Rows cannot be changed or deleted by any client role.

## Verification

- Regenerate a couple password on staging -> one audit row.
- Try update/delete on audit_log as authenticated -> denied.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
