-- 0104 (the deferred "Plan 4" of venue-manager-staff-login): per-event
-- seating was still written straight from the staff browser session, so
-- plain staff — spec §3: "Per-event seating plan: view only" — could
-- move/add/delete tables, rewrite undo history and seat lists from devtools.
--
-- Every staff seating write now runs in /api/venue/events/[eventId]/seating
-- behind the manager-elevation check, with the service-role client (which
-- bypasses everything below). Staff keep exactly what viewing needs:
--   * SELECT on event_layout_elements and event_seat_assignments;
--   * reading events.layout_history (to show undo/redo availability);
--   * UPDATE of events.seating_unseen_at only (markSeatingSeen, on view).
-- The venue's own rooms / standard layouts (room_layout_elements,
-- room_fixed_elements) are untouched: staff still edit those (spec §3).

begin;

drop policy "venue staff manage own event layout elements" on event_layout_elements;
create policy "venue staff reads own event layout elements" on event_layout_elements
  for select using (
    exists (select 1 from events where events.id = event_layout_elements.event_id and is_venue_staff_for(events.venue_id))
  );
revoke insert, update, delete on event_layout_elements from anon, authenticated;

drop policy "venue staff manage own event seat assignments" on public.event_seat_assignments;
create policy "venue staff reads own event seat assignments" on public.event_seat_assignments
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_seat_assignments.event_id and public.is_venue_staff_for(e.venue_id)));
revoke insert, update, delete on public.event_seat_assignments from authenticated;

-- 0095 left layout_history / layout_undo_snapshot writable for this editor.
revoke update on events from authenticated;
grant update (seating_unseen_at) on events to authenticated;

revoke execute on function public.restore_staff_layout(uuid, uuid, jsonb, jsonb) from authenticated;
revoke execute on function public.prune_event_seat_assignments(uuid) from authenticated;

commit;
