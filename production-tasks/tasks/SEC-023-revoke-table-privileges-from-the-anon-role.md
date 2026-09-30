# SEC-023 - Revoke table privileges from the anon role

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Every migration does `grant all on <tables> to anon, authenticated`, relying on RLS alone. The app never queries tables as anon (public pages use the service role on the server), so revoke table privileges from anon entirely - one mistaken permissive policy later then exposes nothing to signed-out users.

## Coachfio reference

Coachfio denies by default and opens exactly what a signed-out visitor needs.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/deps.py (deny by default)`

## Steps

Target files:

- `supabase/migrations/00xx_revoke_anon.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] anon has no privileges on any public table.
- [ ] All pages and tests still work.

## Verification

- `select grantee, table_name from information_schema.role_table_grants where grantee='anon' and table_schema='public'; -- empty`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
