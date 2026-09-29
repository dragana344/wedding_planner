# AUTH-001 - Supabase session refresh in middleware for the venue panel

**Category:** auth · **Priority:** P1 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

@supabase/ssr requires middleware that calls supabase.auth.getUser() to refresh the auth cookie; without it, server components cannot persist a refreshed token (server.ts swallows the cookie write) and venue sessions degrade after the 1-hour JWT expiry. Extend middleware to run the documented Supabase session-refresh for /venue/* and /api/venue/*, and redirect unauthenticated /venue requests to /login at the edge (the layout check stays as defence in depth).

## Coachfio reference

Coachfio enforces the signed-in gate on the server for every protected route, not only in page layouts.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/deps.py (require_user)`

## Steps

Target files:

- `middleware.ts`
- `lib/supabase/server.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A venue session stays valid across the JWT expiry without a manual re-login.
- [ ] Unauthenticated /venue/* is redirected by middleware.

## Verification

- Set jwt_expiry low locally (e.g. 120s), stay on /venue past it, navigate: still signed in.

## Out of scope

- Changing the couple session mechanism.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
