# SEC-010 - Remove the shared default floor-plan lock password '0000'

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** none

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Changes venue onboarding behaviour (how the floor-plan lock code is set). Needs a product decision on the flow.

## Context

Migration 0012 sets every venue's layout_lock_password_hash to crypt('0000') by default, so every venue - including every self-signed-up one - shares the same lock code until staff change it. Options (pick one): generate a random code per venue at provisioning and show it once in settings, or require setting it on first use. Either changes what staff see.

## Coachfio reference

Coachfio refuses to boot production with a development default for any secret.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/config.py (refuse default secrets at boot)`

## Steps

Target files:

- `supabase/migrations/0012_floor_plan_layers.sql (reference only)`
- `supabase/migrations/00xx_layout_lock_default.sql (new)`
- `lib/venue/provisioning.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] No venue created after the change has the '0000' code.
- [ ] Existing venues still on '0000' are identified (report) for follow-up.

## Verification

- `select count(*) from venues where layout_lock_password_hash = crypt('0000', layout_lock_password_hash);`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets). (beyond the approved minimal change)
