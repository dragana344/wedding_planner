# REL-004 - Timeouts on server-side Supabase calls

**Category:** reliability · **Priority:** P2 · **Effort:** S · **Depends on:** REL-002

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Middleware awaits a DB lookup on every couple request with no timeout; if Supabase stalls, the whole couple area hangs. Add AbortSignal.timeout to the service-role client's fetch override (it already overrides fetch) and a statement_timeout for the service role.

## Coachfio reference

Coachfio bounds every external call with a timeout and a wall-clock deadline so a slow dependency degrades into a clear error instead of a hung request.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/config.py (gemini_http_timeout_s, database_statement_timeout_ms)`

Commits: `8007cd3`

## Steps

Target files:

- `lib/supabase/service-role.ts`
- `middleware.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A stalled DB call fails within the timeout with a handled error.

## Verification

- Simulate latency (toxiproxy or a paused local DB) and observe bounded failure.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
