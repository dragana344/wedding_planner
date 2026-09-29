# SEC-009 - Revoke couple sessions when the event password is regenerated

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** SEC-008

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Behaviour change: couples are logged out when the venue regenerates their password (intended security behaviour, but it is a user-visible change).

## Context

regenerate_event_password() resets the hash but leaves couple_sessions intact, so a leaked couple cookie keeps working for up to 30 days after the venue resets the password - exactly the case the reset exists for. Delete the event's couple_sessions inside the same function.

## Coachfio reference

In Coachfio a credential reset revokes every live session (epoch bump); without it a stolen cookie survives the reset.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/deps.py (session_epoch)`
- `admin auth revoke_sessions()`

Commits: `1247ee8`

## Steps

Target files:

- `supabase/migrations/00xx_regenerate_revokes_sessions.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] After regenerate_event_password(event), every existing couple session for that event is rejected.

## Verification

- Log in as couple, regenerate password in the venue panel, reload couple page -> redirected to /couple/login.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
