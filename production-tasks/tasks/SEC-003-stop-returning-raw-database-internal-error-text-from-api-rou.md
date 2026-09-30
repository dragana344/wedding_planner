# SEC-003 - Stop returning raw database/internal error text from API routes

**Category:** security · **Priority:** P1 · **Effort:** M · **Depends on:** ARCH-001

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** User-visible error text changes in failure cases only: a raw DB message is replaced by the route's own existing fallback message. No success path changes.

## Context

Almost every route does `catch (err) { return json({ error: err.message }) }`, so Postgres/PostgREST messages (constraint names, column names, RLS errors) reach the browser. Keep domain errors the code throws on purpose (e.g. 'Invitation not found.', 'Table type does not belong to this room.') but replace any other error with the fallback message each route ALREADY defines, and log the original server-side with a request id (OBS-002).

## Coachfio reference

Coachfio answers errors with deliberate messages and keeps internals in logs/Sentry; a 404 is used instead of 403 so an id's existence is never confirmed.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/main.py (exception handlers)`
- `api/routes/matches.py`

Commits: `03f201e`

## Steps

Target files:

- `app/api/**/route.ts (all 30 handlers)`
- `lib/api/handler.ts (from ARCH-001)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] No API response body contains a raw Postgres/PostgREST/Supabase error message.
- [ ] Intentional domain messages are unchanged.
- [ ] The original error is logged server-side with a request id.

## Verification

- Force a DB error (e.g. invalid uuid) against each route; response shows the fallback text, logs show the original.

## Out of scope

- Changing the wording of the existing fallback messages.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
