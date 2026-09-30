-- 0071 (Session 3, task 2): per-table seat lists.
--
--   replace_table_seats   the couple saves one table's list: old seats out,
--                         new seats in, one transaction (service role only).
--   event_seat_list       seats with display names, for venue staff (who
--                         cannot read event_guests) and the server.
--   event_room_tables_for_staff
--                         event_room_tables() (0070) for venue staff: the
--                         same numbering the couple and guests see.

create or replace function public.replace_table_seats(p_event_id uuid, p_room_id uuid, p_element_id uuid, p_seats jsonb)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  delete from event_seat_assignments where event_id = p_event_id and layout_element_id = p_element_id;
  insert into event_seat_assignments (event_id, room_id, layout_element_id, seat_number, guest_id, guest_name)
  select p_event_id, p_room_id, p_element_id, s.seat_number, s.guest_id, s.guest_name
  from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb)) as s(seat_number integer, guest_id uuid, guest_name text);
end;
$$;

revoke all on function public.replace_table_seats(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_table_seats(uuid, uuid, uuid, jsonb) to service_role;

-- Service role, or staff of the event's venue; anyone else gets 42501.
create or replace function public.assert_event_seating_reader(p_event_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if not exists (select 1 from events e where e.id = p_event_id and is_venue_staff_for(e.venue_id)) then
    raise exception 'Not allowed to read this event''s seating.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_event_seating_reader(uuid) from public, anon, authenticated;

create or replace function public.event_seat_list(p_event_id uuid, p_room_id uuid)
returns table (element_id uuid, seat_number integer, guest_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform assert_event_seating_reader(p_event_id);
  return query
    select s.layout_element_id, s.seat_number, s.guest_id, coalesce(g.full_name, s.guest_name)
    from event_seat_assignments s
    left join event_guests g on g.id = s.guest_id
    where s.event_id = p_event_id and s.room_id = p_room_id
    order by s.layout_element_id, s.seat_number;
end;
$$;

create or replace function public.event_room_tables_for_staff(p_event_id uuid, p_room_id uuid)
returns table (element_id uuid, table_type_id uuid, label text, ord integer, capacity integer)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform assert_event_seating_reader(p_event_id);
  return query select * from event_room_tables(p_event_id, p_room_id) t order by t.ord;
end;
$$;

revoke all on function public.event_seat_list(uuid, uuid) from public, anon, authenticated;
revoke all on function public.event_room_tables_for_staff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.event_seat_list(uuid, uuid) to authenticated, service_role;
grant execute on function public.event_room_tables_for_staff(uuid, uuid) to authenticated, service_role;
