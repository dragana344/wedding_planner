# AUTH-002 - Password reset works end to end in production

**Category:** auth · **Priority:** P0 · **Effort:** S · **Depends on:** SEC-012, INFRA-006

**Requires approval:** no · **Touches logic or frontend:** no

## Context

RecoveryRedirect exists because local Supabase ignores redirectTo; in production the redirect allowlist must include <origin>/reset-password so the link lands on the right page. Verify the whole flow on production and on staging, and document it. No code change expected unless the flow fails.

## Coachfio reference

Coachfio verifies every auth email path against the real provider, not just locally.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `DEPLOY.md (auth redirects)`

## Steps

Target files:

- `app/login/page.tsx`
- `components/RecoveryRedirect.tsx`
- `app/reset-password/page.tsx`
- `docs/production/AUTH.md`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Forgot password -> email -> link -> /reset-password -> new password works on production.
- [ ] Reset link cannot be used twice.

## Verification

- Run the flow on production with a test account.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
