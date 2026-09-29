# COMP-002 - Cookie inventory and consent decision

**Category:** compliance · **Priority:** P2 · **Effort:** S · **Depends on:** COMP-003

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Inventory cookies/storage: couple_session and Supabase auth cookies are strictly necessary. No analytics exist today. Record that no banner is needed while only essential cookies are used, and that adding analytics later requires consent first.

## Coachfio reference

Coachfio loads analytics only after consent and discloses its beacons.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `frontend/consent.js`

Commits: `849dcee`

## Steps

Target files:

- `docs/production/COOKIES.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] COOKIES.md lists every cookie with purpose and lifetime.

## Verification

- Browser devtools on each area vs the doc.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
