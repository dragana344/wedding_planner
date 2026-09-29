# SEC-008 - Couple sessions: hash tokens at rest and throttle renewal writes

**Category:** security · **Priority:** P1 · **Effort:** M · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

couple_sessions stores the raw 32-byte token as primary key, so a read of that table (backup, leaked service key, SQL console) yields live logins. Store sha256(token) instead, looking up by hash; the migration hashes existing rows in place (`update couple_sessions set token = encode(digest(token,'sha256'),'hex')`) so nobody is logged out. Also: middleware currently issues an UPDATE on every couple request to slide the expiry - renew only when less than e.g. 29 of 30 days remain, and add a scheduled delete of expired rows (DATA-007).

## Coachfio reference

Coachfio's session cookie is signed and carries a revocation epoch; the database never holds a usable bearer token.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/deps.py (refuse_stale)`
- `core/auth/session.py`

Commits: `1247ee8`

## Steps

Target files:

- `lib/couple/session-token.ts`
- `lib/couple/session-verify.ts`
- `supabase/migrations/00xx_hash_couple_sessions.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] No plaintext token is stored; existing sessions keep working after the migration.
- [ ] At most one renewal write per session per day.
- [ ] Unit tests cover create/validate/renew/delete with hashing.

## Verification

- `select length(token) from couple_sessions limit 1;  -- 64 hex chars of a hash`
- Log in as a couple before and after the migration: still logged in.

## Out of scope

- Session lifetime (30 days) and cookie attributes.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
