-- 0016's reservations/reservation_tables policies verified is_venue_staff_for
-- but never verified room_id actually belongs to that venue (nor that a
-- reservation_tables row's table actually belongs to the reservation's own
-- room) — the same class of hole 0006 already fixed for event_rooms. Mirror
-- that fix here.

drop policy "venue staff manage own reservations" on reservations;

create policy "venue staff manage own reservations" on reservations
  for all using (
    is_venue_staff_for(venue_id)
    and exists (select 1 from rooms where rooms.id = reservations.room_id and rooms.venue_id = reservations.venue_id)
  ) with check (
    is_venue_staff_for(venue_id)
    and exists (select 1 from rooms where rooms.id = reservations.room_id and rooms.venue_id = reservations.venue_id)
  );

drop policy "venue staff manage own reservation tables" on reservation_tables;

create policy "venue staff manage own reservation tables" on reservation_tables
  for all using (
    exists (
      select 1 from reservations
      join room_layout_elements on room_layout_elements.id = reservation_tables.layout_element_id
      where reservations.id = reservation_tables.reservation_id
        and is_venue_staff_for(reservations.venue_id)
        and room_layout_elements.room_id = reservations.room_id
    )
  ) with check (
    exists (
      select 1 from reservations
      join room_layout_elements on room_layout_elements.id = reservation_tables.layout_element_id
      where reservations.id = reservation_tables.reservation_id
        and is_venue_staff_for(reservations.venue_id)
        and room_layout_elements.room_id = reservations.room_id
    )
  );
