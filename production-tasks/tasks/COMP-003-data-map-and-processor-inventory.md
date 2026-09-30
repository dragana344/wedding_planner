# COMP-003 - Data map and processor inventory

**Category:** compliance · **Priority:** P0 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

List every table/column with personal data (venue staff, couples, guests, contact submissions, photos), where it is stored (Supabase region), which processors touch it (Supabase, host, SMTP, Sentry), and who can access it. This feeds COMP-001, DATA-005 and DATA-007.

## Coachfio reference

Coachfio keeps a sourced record of every vendor, what data it receives and under which terms.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `docs/vendor-terms-and-content-rules.md`
- `web/src/pages/legal/Privacy.tsx`

Commits: `32bd54c`

## Steps

Target files:

- `docs/production/DATA-MAP.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every personal-data column and processor is listed with region and purpose.

## Verification

- Cross-check against the migrations.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
