# DATA-011 - Delete files when their rows are deleted

**Category:** data · **Priority:** P1 · **Effort:** M · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

There is not a single `storage.remove()` call in the codebase. Deleting an event cascades its rows but leaves the couple's invitation photo and the showcase photos on public URLs forever; deleting a menu item or replacing a photo leaves the old file too. Remove the objects alongside the rows (in the same operation, or via a cleanup queue the DATA-007 job drains), and sweep existing orphans once.

## Coachfio reference

In Coachfio deleting a match removes its whole object prefix; a row that is gone must not leave a public file behind.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/storage/erasure.py (objects deleted with the row)`
- `api/routes/matches.py (DELETE removes the object prefix)`

## Steps

Target files:

- `lib/venue/events.ts:304 (deleteEvent)`
- `lib/venue/menus.ts (deleteMenuItem)`
- `lib/venue/showcase.ts:52`
- `lib/couple/invitations.ts (photo replace)`
- `supabase/migrations/00xx_storage_cleanup.sql (new, optional trigger/queue)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] After deleting an event, its invitation and showcase photos return 404.
- [ ] Replacing a photo deletes the previous object.
- [ ] A one-off sweep reports and removes existing orphans.

## Verification

- Delete a test event on staging; its photo URLs 404.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
