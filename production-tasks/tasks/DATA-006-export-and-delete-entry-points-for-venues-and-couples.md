# DATA-006 - Export and delete entry points for venues and couples

**Category:** data · **Priority:** P1 · **Effort:** M · **Depends on:** DATA-005

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** New UI in venue settings.

## Context

Expose DATA-005 to users: venue staff can download their data and delete their venue account; venues can erase an event's personal data (e.g. after the wedding). Confirmation must require typing the venue name/email.

## Coachfio reference

Coachfio puts export and erase on the account page itself - a right whose mechanism is 'know the endpoint' is self-service for engineers only - and makes erasure type the account address to confirm.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `web/src/pages/Account.tsx ('Your data' card)`

Commits: `32bd54c`

## Steps

Target files:

- `app/venue/settings/page.tsx`
- `components/venue/dashboard/SettingsClient.tsx`
- `app/api/venue/privacy/* (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Venue settings offer export and delete with a typed confirmation.
- [ ] Actions are logged (OBS-002).

## Verification

- Manual test on staging with a throwaway venue.

## Out of scope

- Visual redesign of settings beyond the new section.
