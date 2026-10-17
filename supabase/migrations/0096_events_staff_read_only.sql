-- 0095 (Plan 2 final review, Critical finding): "venue staff manage own
-- events" (migration 0004) was `for all` — any signed-in staff member could
-- still insert/update/delete events directly via their own browser client,
-- completely bypassing the new /api/venue/events routes' manager-elevation
-- check (Plan 2).
--
-- Staff keep SELECT, and UPDATE narrowed by column grant to exactly the
-- columns still legitimately written staff-side via the RLS-bound client,
-- outside this feature's scope (the per-event seating/layout editor,
-- deferred to a future "Plan 4" — lib/venue/floorplan.ts,
-- lib/venue/floorplan-history.ts, lib/venue/events.ts's markSeatingSeen):
-- layout_history, layout_undo_snapshot, seating_unseen_at. Every other
-- event field (couple_names, dates, status, contacts, finance, menu, room
-- assignments) is managed exclusively by the new /api/venue/events routes,
-- which after this migration perform the actual write with the
-- service-role client (the elevation-token check is the write's real
-- authorization now; RLS is read-only + narrow-column defense in depth).
-- No staff INSERT/DELETE policy at all: creating/deleting an event is
-- fully gated, with no legitimate unguarded path left.
--
-- event_rooms gets the same SELECT-only treatment — nothing writes it
-- outside lib/venue/events.ts's createEvent/updateEvent, both now
-- service-role calls from the gated routes.

begin;

drop policy "venue staff manage own events" on events;
create policy "venue staff reads own events" on events
  for select using (is_venue_staff_for(venue_id));
create policy "venue staff updates own event (unguarded columns only)" on events
  for update using (is_venue_staff_for(venue_id)) with check (is_venue_staff_for(venue_id));

revoke update on events from authenticated;
grant update (layout_history, layout_undo_snapshot, seating_unseen_at) on events to authenticated;

drop policy "venue staff manage own event_rooms" on event_rooms;
create policy "venue staff reads own event_rooms" on event_rooms
  for select using (
    exists (select 1 from events where events.id = event_rooms.event_id and is_venue_staff_for(events.venue_id))
  );

commit;
