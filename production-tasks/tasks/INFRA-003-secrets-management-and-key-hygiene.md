# INFRA-003 - Secrets management and key hygiene

**Category:** infra · **Priority:** P0 · **Effort:** S · **Depends on:** INFRA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Production secrets (SUPABASE_SERVICE_ROLE_KEY and any added later: Sentry DSN, SMTP, rate-limit store) live only in the host's encrypted env settings, per environment. Confirm the service-role key is never exposed with a NEXT_PUBLIC_ prefix and never reaches a client bundle (see SEC-014 for the code guard). Document every variable, which environments need it, and how to rotate it. Keep .env.local.example complete with placeholder values only.

## Coachfio reference

Coachfio keeps secrets only in .env.prod on the box (0600) and host config, documents every variable in .env.prod.example, and refuses to boot production with a development default for a secret.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `.env.prod.example`
- `core/config.py`
- `api/main.py`

Commits: `3bebf2e`

## Steps

Target files:

- `.env.local.example`
- `lib/supabase/service-role.ts`
- `docs/production/SECRETS.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] docs/production/SECRETS.md lists every env var, its environments, owner and rotation steps.
- [ ] No production secret is present in the repo or its history (git log -p shows none).
- [ ] The production service-role key is distinct from staging/dev and was never committed.

## Verification

- `git log -p --all | grep -nE 'service_role|eyJhbGci' || echo clean`
- After `next build`: grep -r SUPABASE_SERVICE_ROLE_KEY .next/static || echo not-in-client-bundle

## Out of scope

- Rotating keys used only on a laptop against local Supabase.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
