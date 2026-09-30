# DATA-004 - Index review for hot paths

**Category:** data · **Priority:** P2 · **Effort:** S · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Check indexes for every FK used in filters (event_id on all event_* tables, venue_id, room_id), couple_sessions(expires_at) for cleanup, event_invitations(public_slug) unique, event_credentials(username) unique. Use EXPLAIN on the heaviest pages (venue dashboard, guest list) with realistic data.

## Coachfio reference

Coachfio sizes the database against measured query patterns, not guesses.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `migrations/ (indexes)`
- `admin/storage/capacity.py`

## Steps

Target files:

- `supabase/migrations/00xx_indexes.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every filtered FK column is indexed.
- [ ] No sequential scan on the hot queries at 10x current data.

## Verification

- EXPLAIN ANALYZE of the listed queries
- Supabase performance advisor

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
