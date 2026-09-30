# SEC-019 - Storage update policy must check the destination folder

**Category:** security · **Priority:** P0 · **Effort:** S · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Of 35 policies, one update policy has no WITH CHECK: "venue staff update own menu item photos" on storage.objects checks the folder of the row BEFORE the update only. A staff member can therefore update an object's name into another venue's folder, planting or overwriting a file there. Add WITH CHECK with the same is_venue_staff_for condition, and a test that tries it.

## Coachfio reference

Coachfio pins cross-tenant isolation on the real database, including the half that is easy to forget.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tests/integration/ (tenant isolation on real Postgres)`

## Steps

Target files:

- `supabase/migrations/0007_menu_item_price_photo.sql (reference)`
- `supabase/migrations/00xx_storage_update_with_check.sql (new)`
- `tests/supabase/storage_policies.test.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Moving/renaming an object into another venue's folder is refused.
- [ ] Staff can still update their own photos.

## Verification

- `npm run test:db -- storage_policies`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
