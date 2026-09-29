# SEC-022 - Couple login must not reveal which usernames exist

**Category:** security · **Priority:** P2 · **Effort:** S · **Depends on:** SEC-002

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** A locked couple would see the generic 'wrong username or password' text instead of 'too many attempts'.

## Context

verify_event_credentials returns 'locked' only for a real username, so the lockout message confirms that a username exists. With IP rate limiting (SEC-002) in place, return the same message for unknown and locked usernames, or lock unknown usernames symmetrically.

## Coachfio reference

Coachfio never answers in a way that confirms an identifier exists.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/routes/support.py (404 never 403)`

## Steps

Target files:

- `supabase/migrations/0013_couple_dashboard.sql (reference)`
- `app/api/couple/login/route.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Unknown and existing-but-locked usernames produce the same response.

## Verification

- Script 6 bad logins for a real and a fake username; compare responses.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
