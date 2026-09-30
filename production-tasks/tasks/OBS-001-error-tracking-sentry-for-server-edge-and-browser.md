# OBS-001 - Error tracking (Sentry) for server, edge and browser

**Category:** observability · **Priority:** P0 · **Effort:** M · **Depends on:** REL-002

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Nothing reports errors today; a failing route is invisible until a customer complains. Add @sentry/nextjs, tag events with the release SHA and environment, and scrub PII: guest names/phones, couple contact details, request bodies and cookies must not be sent. Source maps uploaded, not served publicly.

## Coachfio reference

Coachfio reports server and browser errors to Sentry with the release attached and nothing personal in the payload; the browser reporter is capped so a render loop cannot flood it.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/observability.py`
- `web/src/lib/errors.ts`
- `api/routes/client_errors.py`

Commits: `03f201e`, `4b48fd8`

## Steps

Target files:

- `sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts (new)`
- `instrumentation.ts (new)`
- `next.config.mjs`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A thrown error in a route handler, middleware and a client component each appear in Sentry with release + environment.
- [ ] Events contain no request bodies, cookies or guest/couple personal data.

## Verification

- Trigger a test error in each runtime on staging; inspect the event payload.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
