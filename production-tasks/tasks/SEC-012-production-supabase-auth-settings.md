# SEC-012 - Production Supabase Auth settings

**Category:** security · **Priority:** P0 · **Effort:** S · **Depends on:** INFRA-002, INFRA-006

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Enabling email confirmation and a longer minimum password changes the venue signup experience (an extra confirmation step).

## Context

Local config has email confirmations OFF, minimum password length 6, secure_password_change off, and site_url/redirects on 127.0.0.1. For production: Site URL = canonical https origin; redirect allowlist = <origin>/reset-password only; confirmations ON; minimum length >= 10 with leaked-password protection; secure password change ON; sane auth rate limits. SignupForm already handles the 'no session until confirmed' case, so the code path exists - but turning confirmations on changes the signup experience.

## Coachfio reference

Coachfio proves identity with the provider (email code/OAuth) and never trusts an unverified claim; dev-only shortcuts are refused the moment a provider is configured.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/auth/`
- `DEPLOY.md (Supabase section)`

Commits: `849dcee`

## Steps

Target files:

- `supabase/config.toml (local parity)`
- `(production Supabase Auth settings)`
- `docs/production/AUTH.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Production auth settings match docs/production/AUTH.md.
- [ ] A new signup must confirm email before reaching /venue.
- [ ] Password shorter than the minimum is refused.

## Verification

- Sign up on production with a new address; confirm the email gate.
- Supabase dashboard -> Auth -> Settings screenshot attached to the doc.

## Out of scope

- Adding MFA or OAuth providers.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
