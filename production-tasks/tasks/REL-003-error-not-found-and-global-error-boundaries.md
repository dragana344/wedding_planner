# REL-003 - Error, not-found and global-error boundaries

**Category:** reliability · **Priority:** P1 · **Effort:** S · **Depends on:** OBS-001

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Adds user-visible error and 404 pages (copy + look need sign-off).

## Context

The app has no error.tsx, global-error.tsx or not-found.tsx, so an unexpected server error shows Next's default screen and is not reported. Add them using the existing visual styles, and report the error to Sentry (OBS-001).

## Coachfio reference

Coachfio never leaves a user on a framework error screen; failures render a product page and are reported.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `web/src/ui/states.tsx (ErrorState)`

## Steps

Target files:

- `app/error.tsx (new)`
- `app/global-error.tsx (new)`
- `app/not-found.tsx (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A thrown error in any page renders the app's error page and reaches Sentry.
- [ ] Unknown URLs render the app's 404.

## Verification

- Throw in a test page on staging; confirm page + Sentry event.

## Out of scope

- New visual design.
