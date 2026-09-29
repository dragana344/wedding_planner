# DATA-005 - Personal data export and erasure (server side)

**Category:** data · **Priority:** P1 · **Effort:** L · **Depends on:** TEST-001

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** New data-deletion capability: what gets deleted vs. retained (e.g. anonymised reservation/finance records) is a business decision.

## Context

The app stores personal data of three groups: venue staff (auth email), couples (names, contact email/phone), and guests (names, phones, notes, RSVP) - the guests never agreed to anything themselves. Build server-side functions to (a) export all data for a venue account and for an event, (b) erase an event's personal data and (c) delete a venue account with everything it owns, including storage objects. Include a guard test that lists every column holding personal data and fails when a new one appears without a rule.

## Coachfio reference

Coachfio exports every user-linked table and erases with a tombstone that keeps financial history anonymised; a guard test fails the build when a new table with personal data has no erasure decision.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/storage/erasure.py`
- `tests/test_erasure.py`

Commits: `32bd54c`, `13ae8a3`

## Steps

Target files:

- `lib/privacy/export.ts (new)`
- `lib/privacy/erase.ts (new)`
- `supabase/migrations/00xx_privacy_functions.sql (new)`
- `tests/lib/privacy/*.test.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Export returns every personal-data table for the subject.
- [ ] Erasure leaves no personal data in DB or storage for the subject.
- [ ] Guard test fails on an unclassified personal-data column.

## Verification

- `npm run test:db -- privacy`

## Out of scope

- UI entry points (DATA-006).
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
