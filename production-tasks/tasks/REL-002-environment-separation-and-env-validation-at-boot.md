# REL-002 - Environment separation and env validation at boot

**Category:** reliability · **Priority:** P0 · **Effort:** M · **Depends on:** INFRA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Create separate Supabase projects for staging and production (local stays on `supabase start`), map them to the host's Preview and Production environments, and validate required env vars at startup (typed schema): a missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL must fail the build/boot with a clear message, not a 500 at runtime from a `!` non-null assertion.

## Coachfio reference

Coachfio has one typed settings object; production refuses to start with a missing or development-default secret instead of failing on the first request.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/config.py`
- `api/main.py (refuse to boot prod with unsafe config)`

## Steps

Target files:

- `lib/env.ts (new)`
- `docs/production/ENVIRONMENTS.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Staging and production use different Supabase projects and keys.
- [ ] A missing required env var fails build/boot with a named error.

## Verification

- Unset one var in a preview deploy -> build fails naming the var.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
