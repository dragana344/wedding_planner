# ARCH-003 - Decide what to do with the placeholder pages at launch

**Category:** architecture · **Priority:** P1 · **Effort:** S · **Depends on:** none

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Changes what appears in both navigation menus.

## Context

Seven routes render a ComingSoon placeholder (confirmed in the build: ~166 B each) and are linked from the venue and couple navigation. Decide per page: hide from nav until built, mark as 'soon' visibly, or build. Venue 'Support' in particular should at least show a real contact route.

## Coachfio reference

Ship what works; a nav link to 'coming soon' reads as unfinished to a paying customer.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `-`

## Steps

Target files:

- `app/venue/{messages,notifications,reports,support}/page.tsx`
- `app/couple/(protected)/{greetings,messages,album}/page.tsx`
- `components/venue/shell/nav.ts`
- `components/couple/shell/nav.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every nav item leads to a working page or is clearly marked/hidden, per the decision.

## Verification

- Click every nav item on staging.

## Out of scope

- Building the features.
