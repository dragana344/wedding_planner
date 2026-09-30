# SEC-020 - Stop anonymous listing of the public storage buckets

**Category:** security · **Priority:** P0 · **Effort:** S · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Three buckets have `create policy ... for select using (bucket_id = '<bucket>')` with no role restriction. That policy is not needed to view a public object (public buckets serve /object/public/... without RLS) - what it grants is LIST: anyone holding the public anon key can list every object in invitation-photos, whose names are `<eventId>-<timestamp>.<ext>`, i.e. every couple's photo and every event id. Drop the three select policies (or restrict them to the owning staff), keep public URLs working, and add a test that anon list() returns nothing.

## Coachfio reference

Coachfio serves media by signed URL scoped to one object; nothing lets a stranger enumerate other customers' files.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `tests/integration/ (tenant isolation on real Postgres)`

## Steps

Target files:

- `supabase/migrations/0007_menu_item_price_photo.sql, 0008_event_showcase_photos.sql, 0022_organizer_tools.sql (reference)`
- `supabase/migrations/00xx_storage_no_public_list.sql (new)`
- `tests/supabase/storage_policies.test.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Anonymous list() on all three buckets returns no objects.
- [ ] Existing public photo URLs still load on menus, showcase and invitations.

## Verification

- `supabase.storage.from('invitation-photos').list() with the anon key -> []`
- Open /invite/<slug> -> photo still shows

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
