# SEC-017 - Sign out everywhere for venue staff

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** AUTH-001

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Adds a button in settings/sign-out.

## Context

Supabase supports `signOut({ scope: "global" })`, which revokes every refresh token of the user. Offer it next to the normal sign-out, and call it automatically after a password change (reset-password page).

## Coachfio reference

In Coachfio a copied session cookie (shared laptop, lost phone) can be killed from any device; without it the honest answer is that nothing can be done.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/deps.py (session_epoch)`
- `api/routes/auth.py (signout?everywhere=true)`

Commits: `1247ee8`

## Steps

Target files:

- `app/venue/settings/page.tsx`
- `components/venue/shell/PanelShell.tsx (sign-out action)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] 'Sign out everywhere' ends sessions on other devices within one token lifetime.
- [ ] A password change signs out other devices.

## Verification

- Sign in on two browsers, sign out everywhere on one, the other loses access after refresh.

## Out of scope

- Changing the normal sign-out.
