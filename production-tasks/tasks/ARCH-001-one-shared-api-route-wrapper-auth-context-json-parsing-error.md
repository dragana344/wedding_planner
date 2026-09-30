# ARCH-001 - One shared API route wrapper (auth context, JSON parsing, errors)

**Category:** architecture · **Priority:** P0 · **Effort:** M · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

The 27 couple routes hand-copy the same four steps: read x-couple-event-id, return 401, parse JSON, catch and return err.message. Extract a wrapper (e.g. withCoupleEvent(handler) and withPublic(handler)) that does exactly what the routes do today, then migrate routes to it one by one. This is a pure refactor with identical responses; it is the seam SEC-003, SEC-004 and OBS-002 plug into.

## Coachfio reference

Coachfio has one dependency that resolves the caller and one error path; routes never re-implement them.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/deps.py`
- `api/main.py (exception handlers)`

## Steps

Target files:

- `lib/api/handler.ts (new)`
- `app/api/**/route.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] All couple routes use the wrapper.
- [ ] Response bodies and status codes are byte-identical to before for every existing test.

## Verification

- `npm run test:unit`
- `git diff shows no change to response shapes`

## Out of scope

- Changing any response, status code or message in this task.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
