# SEC-015 - CSRF defence for cookie-authenticated mutations

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

couple_session is SameSite=Lax (good) but POST/PATCH/PUT/DELETE on /api/couple/* are not otherwise checked. Add an Origin/Referer check in middleware for non-GET requests under /api/ that rejects foreign origins with 403. The venue side uses Supabase auth cookies set by @supabase/ssr - include /api/venue/* too.

## Coachfio reference

Coachfio relies on SameSite cookies plus a strict CORS allowlist; state-changing routes are never reachable cross-site with the victim's cookie.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/main.py (CORS allowlist)`
- `core/auth/`

## Steps

Target files:

- `middleware.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A cross-origin POST to any /api/couple or /api/venue route with a valid cookie is refused.
- [ ] Same-origin requests work unchanged.

## Verification

- `curl -X POST -H 'Origin: https://evil.example' -b 'couple_session=...' https://<domain>/api/couple/notes -> 403`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
