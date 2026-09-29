# TEST-008 - Load test before launch

**Category:** testing · **Priority:** P1 · **Effort:** M · **Depends on:** CICD-003, INFRA-007

**Requires approval:** no · **Touches logic or frontend:** no

## Context

On staging with production-like data: simulate an invitation going viral (hundreds of guests opening /invite and posting RSVPs within minutes) and a busy venue panel. Record p95 latency, error rate, Supabase CPU/connections, and the first limit hit.

## Coachfio reference

Coachfio measured its ceiling before launch and wrote it down, so capacity is a number, not a feeling.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `docs/load-test-2026-08-29.md`
- `docs/load-test-TEMPLATE.md`

## Steps

Target files:

- `loadtest/*.js (new, k6)`
- `docs/production/LOAD-TEST.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Documented p95 and error rate at 2x expected peak, with the first bottleneck named.

## Verification

- k6 run loadtest/invite-rsvp.js

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
