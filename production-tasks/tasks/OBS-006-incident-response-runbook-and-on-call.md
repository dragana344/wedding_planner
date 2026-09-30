# OBS-006 - Incident response runbook and on-call

**Category:** observability · **Priority:** P1 · **Effort:** S · **Depends on:** OBS-003, CICD-004

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Who is on call, how alerts reach them, first steps for the likely incidents (site down, Supabase down, email not arriving, data deleted by mistake, leaked key), how to communicate with venues, and a template for a short post-incident note.

## Coachfio reference

Coachfio writes down every incident's cause and fix, so the next one takes minutes, not an evening.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `DEPLOY.md`
- `CLAUDE.md (dated incident notes)`

## Steps

Target files:

- `docs/production/INCIDENTS.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] INCIDENTS.md covers the five scenarios with concrete steps and names.

## Verification

- Tabletop exercise: walk one scenario end to end.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
