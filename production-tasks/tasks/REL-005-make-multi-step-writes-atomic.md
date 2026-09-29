# REL-005 - Make multi-step writes atomic

**Category:** reliability · **Priority:** P2 · **Effort:** M · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Several operations are sequences of separate PostgREST calls: venue provisioning (insert venue, then staff row), seating confirm (delete then insert), agenda reorder (two updates), menu selection (update then delete). A failure halfway leaves partial state. Move each into a Postgres function called via rpc, same inputs and outputs.

## Coachfio reference

Coachfio puts every multi-row change that must succeed or fail together inside one transaction (and learned the hard way what a crash between two commits does).

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/pipeline/outbox.py`
- `core/affiliate/commissions.py (savepoint)`

Commits: `ffa2d6f`, `586720f`

## Steps

Target files:

- `supabase/migrations/00xx_atomic_rpcs.sql (new)`
- `lib/venue/provisioning.ts`
- `lib/couple/seating.ts (confirmSeating)`
- `lib/couple/agenda.ts (moveAgendaItem)`
- `lib/couple/menu.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Each listed operation is a single transaction.
- [ ] Behaviour and return values unchanged; existing tests green.

## Verification

- `npm run test:db`
- Kill the connection mid-operation in a test: no partial state.

## Out of scope

- Changing what the operations do.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
