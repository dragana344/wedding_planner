# PERF-003 - Bundle size baseline

**Category:** performance · **Priority:** P2 · **Effort:** S · **Depends on:** CICD-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Add @next/bundle-analyzer behind an env flag and record per-route first-load JS in the PR; no code changes.

## Coachfio reference

Measure before optimising.

## Steps

Target files:

- `next.config.mjs`
- `package.json`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A baseline report exists.

## Verification

- `ANALYZE=true npm run build`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
