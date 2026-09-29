# OBS-004 - Third-party quota and cost monitoring

**Category:** observability · **Priority:** P2 · **Effort:** S · **Depends on:** INFRA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

List every limit that can stop the product: Supabase DB size, egress, storage, auth emails/hour, connection count; Vercel function invocations/bandwidth; SMTP provider sends/day. Set usage alerts where the provider supports them.

## Coachfio reference

Coachfio reads every provider ceiling it can (and reports the ones it cannot as blind spots), so the first limit hit is known before users hit it.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `admin/storage/capacity.py`
- `admin/storage/spending.py`

## Steps

Target files:

- `docs/production/QUOTAS.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Each limit has a current value, the ceiling, and an alert threshold documented.

## Verification

- Review QUOTAS.md against the provider dashboards.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
