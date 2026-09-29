# SEC-025 - Pre-launch security review

**Category:** security · **Priority:** P1 · **Effort:** M · **Depends on:** SEC-001, SEC-002, SEC-004, SEC-005, SEC-019, SEC-020, TEST-002

**Requires approval:** no · **Touches logic or frontend:** no

## Context

After the P0 security tasks, run a focused review on staging: OWASP ASVS L1 checklist, authenticated scans of the venue and couple APIs (e.g. OWASP ZAP), manual tests of the couple session, invite slug, RSVP and upload flows, and the Supabase security advisor. Record findings and fixes.

## Coachfio reference

Coachfio had an external audit and a written remediation plan; several of its best fixes came from it (body caps, route markers).

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `docs/audit-2026-09-02.md`
- `docs/audit-remediation-plan.md`

## Steps

Target files:

- `docs/production/SECURITY-REVIEW.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A written review exists with every finding fixed or accepted with a reason.

## Verification

- Review SECURITY-REVIEW.md

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
