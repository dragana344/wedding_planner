# SEC-004 - Input validation on every API route (and a PostgREST filter-injection fix)

**Category:** security · **Priority:** P0 · **Effort:** M · **Depends on:** ARCH-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Route bodies are used unvalidated. Concretely: (1) lib/couple/menu.ts builds a PostgREST filter string `.not("menu_item_id","in",`(${ids.join(",")})`)` from client-supplied ids - a crafted id can alter the filter; validate every id as a UUID before it is interpolated. (2) seating/elements POST spreads the whole body into the insert (`{...body, event_id}`) - whitelist fields. (3) Enforce types, lengths (names, notes, messages), enums (rsvp_status, side, mode) and numeric ranges (party_size >= 1, sane max) on all couple routes and the three public routes. Invalid input returns 400 with the route's existing message style; valid input behaves exactly as today.

## Coachfio reference

Coachfio validates every request body with a typed schema (bounded strings, enums, ids) before touching the DB, and path ids are checked against the caller's ownership.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/schemas.py`
- `api/routes/matches.py (_owned)`

Commits: `19f00ec`

## Steps

Target files:

- `lib/api/schemas.ts (new, e.g. zod)`
- `app/api/**/route.ts`
- `lib/couple/menu.ts (setMenuItemQuantities)`
- `app/api/couple/seating/elements/route.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every route parses its body/params through a schema.
- [ ] Non-UUID ids are rejected before any query is built.
- [ ] Only whitelisted fields reach insert/update.
- [ ] Existing component and lib tests stay green; new tests cover rejection cases.

## Verification

- `npm run test:unit`
- `curl ... PATCH /api/couple/menu/quantities with an id like 'x),menu_item_id.not.is.null' returns 400`

## Out of scope

- Changing validation of valid inputs the UI already sends.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
