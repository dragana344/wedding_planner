# REL-001 - Health endpoint with release id

**Category:** reliability · **Priority:** P1 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Add GET /api/health: 200 with {ok, release} when a trivial service-role query succeeds, 503 otherwise; no auth, no personal data, never cached. release = the deploy's git SHA (e.g. VERCEL_GIT_COMMIT_SHA).

## Coachfio reference

Coachfio's /health pings the database and reports the running release, which is what uptime checks and the deployed-code CI job read.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/main.py (/health)`
- `Dockerfile (GIT_SHA)`

Commits: `d3d558b`, `1d0a8c8`

## Steps

Target files:

- `app/api/health/route.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Returns 200 + release when healthy, 503 when the DB is unreachable.

## Verification

- `curl -s https://<domain>/api/health`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
