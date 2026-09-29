# SEC-016 - MFA (TOTP) for venue staff

**Category:** security · **Priority:** P1 · **Effort:** M · **Depends on:** SEC-012

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** New screens in login and settings.

## Context

A venue staff account can read every event, couple and guest of that venue and create couple credentials. Enable Supabase Auth MFA (TOTP): enrolment in venue settings, a second step at login when a factor exists, and require aal2 on /venue and /api/venue once enrolled. Start as opt-in, decide later whether to make it mandatory.

## Coachfio reference

Coachfio requires TOTP for every staff account on the admin host: the account that can see everyone's data gets the stronger control.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `admin/ (mandatory TOTP for staff)`
- `migration 0023`

## Steps

Target files:

- `app/login/page.tsx`
- `app/venue/settings/page.tsx`
- `middleware.ts`
- `docs/production/AUTH.md`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Staff can enrol TOTP in settings and must pass it at login afterwards.
- [ ] With a factor enrolled, an aal1 session cannot reach /venue data.

## Verification

- Enrol on staging, sign out, sign in: the code is required.
- Call a venue API with an aal1 token -> refused.

## Out of scope

- Making MFA mandatory (separate decision).
