-- 0004's event_rooms policy verified the event belongs to the caller's venue,
-- but never verified room_id belongs to that same venue, so venue staff could
-- link an event to another venue's room. Replace the policy to also require
-- rooms.venue_id = events.venue_id.
drop policy "venue staff manage own event_rooms" on event_rooms;

create policy "venue staff manage own event_rooms" on event_rooms
  for all using (
    exists (
      select 1 from events
      join rooms on rooms.id = event_rooms.room_id
      where events.id = event_rooms.event_id
        and is_venue_staff_for(events.venue_id)
        and rooms.venue_id = events.venue_id
    )
  ) with check (
    exists (
      select 1 from events
      join rooms on rooms.id = event_rooms.room_id
      where events.id = event_rooms.event_id
        and is_venue_staff_for(events.venue_id)
        and rooms.venue_id = events.venue_id
    )
  );
