# PERF-002 - Bounded queries on list endpoints

**Category:** performance · **Priority:** P2 · **Effort:** M · **Depends on:** TEST-001

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** If a cap is ever reached, lists shown to users would be truncated; the cap values need sign-off.

## Context

Only 2 queries in lib/ use limit/range; guest lists and venue lists are unbounded. Measure realistic maxima (a large wedding ~500 guests) and add explicit upper bounds well above them, with a logged warning when hit.

## Coachfio reference

Coachfio bounds every list and says when a list was cut, because a truncated list that does not say so is read as complete.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `admin/storage/reports.py (bounded lists + has_more)`

## Steps

Target files:

- `lib/couple/guests.ts`
- `lib/venue/*.ts (list functions)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] No unbounded select on a user-growable table.

## Verification

- `grep -rn 'from(' lib | review`
- Load test with 5,000 guests.

## Out of scope

- Adding pagination UI.
