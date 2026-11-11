-- 0144: the seating rail's drag-and-drop — one atomic move/assign, instead
-- of the client doing a delete-then-insert as two separate round trips
-- (which could strand a guest with no seat if the second call failed).
--
-- p_from_element_id/p_from_seat_number: omit when the guest wasn't seated
-- yet (drag from the rail). When given, the seat there must still hold
-- p_guest_id — otherwise someone else changed it since the page loaded, same
-- "changed since you loaded it" (S3001) convention replace_table_seats uses.
--
-- Capacity, same-event and party-size checks all already happen in the
-- existing event_seat_assignments_validate trigger (0076) on the insert, and
-- its error hints already map to Macedonian messages in seatConflictMessage
-- (lib/seating/seats.ts) — nothing new needed there. A seat taken by someone
-- else in the meantime fails the insert's unique constraint (23505), already
-- mapped too.

begin;

create or replace function public.move_event_seat(
  p_event_id uuid,
  p_room_id uuid,
  p_guest_id uuid,
  p_to_element_id uuid,
  p_to_seat_number integer,
  p_from_element_id uuid default null,
  p_from_seat_number integer default null
)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_current_guest uuid;
begin
  perform pg_advisory_xact_lock(hashtext('event_seats:' || p_event_id::text));

  if p_from_element_id is not null then
    select guest_id into v_current_guest
    from event_seat_assignments
    where event_id = p_event_id and layout_element_id = p_from_element_id and seat_number = p_from_seat_number;
    if v_current_guest is distinct from p_guest_id then
      raise exception 'The seat changed since it was loaded.' using errcode = 'S3001';
    end if;
    delete from event_seat_assignments
    where event_id = p_event_id and layout_element_id = p_from_element_id and seat_number = p_from_seat_number;
  end if;

  insert into event_seat_assignments (event_id, room_id, layout_element_id, seat_number, guest_id)
  values (p_event_id, p_room_id, p_to_element_id, p_to_seat_number, p_guest_id);
end;
$$;

revoke all on function public.move_event_seat(uuid, uuid, uuid, uuid, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.move_event_seat(uuid, uuid, uuid, uuid, integer, uuid, integer) to service_role;

commit;
