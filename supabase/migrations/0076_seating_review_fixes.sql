-- 0076 (Session 3): fixes from the final review of the seating work.
--
--   C1/I1  restore_staff_layout: staff undo/redo restores the live layout in
--          one transaction and only ADDS seats back (on tables that have none
--          now) — it never deletes seats the couple made in between.
--   I2     replace_table_seats takes the list the client loaded; a different
--          list in the database (another tab/device saved first) raises
--          S3001 instead of silently overwriting. The seat trigger tags each
--          refusal with a hint, so the API can say what went wrong.
--   I3     a table type that shrinks or is deleted frees the seats it no
--          longer has; seats_affected_by_table_type lets staff see how many
--          first. Confirming a draft that still names a deleted type works.

-- ---------------------------------------------------------------------------
-- Pruning, callable from triggers without the caller check.
-- ---------------------------------------------------------------------------

create or replace function public.prune_event_seats_internal(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_removed integer;
begin
  perform pg_advisory_xact_lock(hashtext('event_seats:' || p_event_id::text));
  delete from event_seat_assignments s
  where s.event_id = p_event_id
    and not exists (
      select 1 from event_room_tables(s.event_id, s.room_id) t
      where t.element_id = s.layout_element_id and s.seat_number <= t.capacity
    );
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function public.prune_event_seats_internal(uuid) from public, anon, authenticated;

create or replace function public.prune_event_seat_assignments(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform assert_event_seating_reader(p_event_id);
  return prune_event_seats_internal(p_event_id);
end;
$$;

revoke all on function public.prune_event_seat_assignments(uuid) from public, anon, authenticated;
grant execute on function public.prune_event_seat_assignments(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- I3: table types
-- ---------------------------------------------------------------------------

create or replace function public.prune_seats_for_table_type()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event uuid;
begin
  for v_event in
    select distinct s.event_id from event_seat_assignments s where s.room_id = old.room_id
  loop
    perform prune_event_seats_internal(v_event);
  end loop;
  return null;
end;
$$;

revoke all on function public.prune_seats_for_table_type() from public, anon, authenticated;

create trigger table_types_prune_seats
  after update of seats or delete on public.table_types
  for each row execute function public.prune_seats_for_table_type();

-- How many seated people a change to this type would unseat: those beyond
-- p_seats, or all of them when p_seats is null (the type is being deleted).
create or replace function public.seats_affected_by_table_type(p_table_type_id uuid, p_seats integer)
returns integer
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_room uuid;
  v_venue uuid;
  v_count integer;
begin
  select tt.room_id, r.venue_id into v_room, v_venue
  from table_types tt join rooms r on r.id = tt.room_id
  where tt.id = p_table_type_id;
  if v_room is null then
    return 0;
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not is_venue_staff_for(v_venue) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select count(*) into v_count
  from event_seat_assignments s
  cross join lateral event_room_tables(s.event_id, s.room_id) t
  where s.room_id = v_room
    and t.element_id = s.layout_element_id
    and t.table_type_id = p_table_type_id
    and (p_seats is null or s.seat_number > p_seats);
  return v_count;
end;
$$;

revoke all on function public.seats_affected_by_table_type(uuid, integer) from public, anon, authenticated;
grant execute on function public.seats_affected_by_table_type(uuid, integer) to authenticated, service_role;

-- Confirm: a table type deleted since the couple placed the table is dropped
-- from the table (it would fail the foreign key and block the whole confirm).
create or replace function public.confirm_event_seating(p_event_id uuid, p_room_id uuid, p_elements jsonb, p_confirmed_at text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from event_layout_elements where event_id = p_event_id and room_id = p_room_id;
  insert into event_layout_elements (id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm,
                                     rotation_deg, label, group_id, table_role, created_at)
  select coalesce(e.id, gen_random_uuid()), p_event_id, p_room_id, e.element_type,
         (select tt.id from table_types tt where tt.id = e.table_type_id and tt.room_id = p_room_id),
         e.x_cm, e.y_cm, e.width_cm, e.length_cm, e.rotation_deg, e.label, e.group_id, coalesce(e.table_role, 'guest'),
         now() + (x.ord * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p_elements, '[]'::jsonb)) with ordinality as x(value, ord)
  cross join lateral jsonb_to_record(x.value) as e(
    id uuid, element_type text, table_type_id uuid, x_cm numeric, y_cm numeric,
    width_cm numeric, length_cm numeric, rotation_deg numeric, label text, group_id uuid, table_role text
  );
  update events
  set seating_confirmed_at = coalesce(seating_confirmed_at, '{}'::jsonb) || jsonb_build_object(p_room_id::text, p_confirmed_at)
  where id = p_event_id;
end;
$$;

revoke all on function public.confirm_event_seating(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.confirm_event_seating(uuid, uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- C1/I1: staff undo/redo
-- ---------------------------------------------------------------------------

-- Runs as the caller: RLS limits staff to their own venue's rows.
create or replace function public.restore_staff_layout(p_event_id uuid, p_room_id uuid, p_elements jsonb, p_seats jsonb)
returns integer
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_seat record;
  v_restored integer := 0;
begin
  delete from event_layout_elements where event_id = p_event_id and room_id = p_room_id;
  insert into event_layout_elements (id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm,
                                     rotation_deg, label, group_id, table_role, created_at)
  select e.id, p_event_id, p_room_id, e.element_type,
         (select tt.id from table_types tt where tt.id = e.table_type_id and tt.room_id = p_room_id),
         e.x_cm, e.y_cm, e.width_cm, e.length_cm, coalesce(e.rotation_deg, 0), e.label, e.group_id,
         coalesce(e.table_role, 'guest'), now() + (x.ord * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p_elements, '[]'::jsonb)) with ordinality as x(value, ord)
  cross join lateral jsonb_to_record(x.value) as e(
    id uuid, element_type text, table_type_id uuid, x_cm numeric, y_cm numeric,
    width_cm numeric, length_cm numeric, rotation_deg numeric, label text, group_id uuid, table_role text
  );

  -- Seats: only put back those on tables that have nobody now. Seats made
  -- after the snapshot (by the couple) are never touched.
  for v_seat in
    select * from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb))
      as s(layout_element_id uuid, seat_number integer, guest_id uuid, guest_name text)
    where not exists (
      select 1 from event_seat_assignments cur
      where cur.event_id = p_event_id and cur.layout_element_id = s.layout_element_id
    )
  loop
    begin
      insert into event_seat_assignments (event_id, room_id, layout_element_id, seat_number, guest_id, guest_name)
      values (p_event_id, p_room_id, v_seat.layout_element_id, v_seat.seat_number, v_seat.guest_id, v_seat.guest_name);
      v_restored := v_restored + 1;
    exception
      when foreign_key_violation or check_violation or unique_violation or not_null_violation then
        null;
    end;
  end loop;
  return v_restored;
end;
$$;

revoke all on function public.restore_staff_layout(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.restore_staff_layout(uuid, uuid, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- I2: seat-list saves
-- ---------------------------------------------------------------------------

-- Same checks as 0070; each refusal now carries a hint the API maps to a message.
create or replace function public.validate_event_seat_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_capacity integer;
  v_guest_event uuid;
  v_party integer;
  v_taken integer;
begin
  perform pg_advisory_xact_lock(hashtext('event_seats:' || new.event_id::text));

  if not exists (select 1 from event_rooms where event_id = new.event_id and room_id = new.room_id) then
    raise exception 'Room is not assigned to this event.' using errcode = '23514', hint = 'no_table';
  end if;

  select t.capacity into v_capacity
  from event_room_tables(new.event_id, new.room_id) t
  where t.element_id = new.layout_element_id;
  if v_capacity is null then
    raise exception 'Table is not part of this event''s layout.' using errcode = '23514', hint = 'no_table';
  end if;
  if new.seat_number > v_capacity then
    raise exception 'Seat % is beyond the table''s % seats.', new.seat_number, v_capacity using errcode = '23514', hint = 'over_capacity';
  end if;

  if new.guest_id is not null then
    select event_id, party_size into v_guest_event, v_party from event_guests where id = new.guest_id;
    if v_guest_event is distinct from new.event_id then
      raise exception 'Guest does not belong to this event.' using errcode = '23514', hint = 'other_event';
    end if;
    select count(*) into v_taken
    from event_seat_assignments
    where guest_id = new.guest_id and id <> new.id;
    if v_taken >= v_party then
      raise exception 'Guest already holds all % of their seats.', v_party using errcode = '23514', hint = 'party_full';
    end if;
  end if;

  new.guest_name := nullif(btrim(new.guest_name), '');
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_event_seat_assignment() from public, anon, authenticated;

drop function public.replace_table_seats(uuid, uuid, uuid, jsonb);

-- p_expected: the table's seats as the client loaded them
-- ([{seat_number, guest_id, guest_name}]); null skips the check.
create or replace function public.replace_table_seats(p_event_id uuid, p_room_id uuid, p_element_id uuid, p_seats jsonb, p_expected jsonb default null)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_current jsonb;
  v_expected jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('event_seats:' || p_event_id::text));
  if p_expected is not null then
    select coalesce(jsonb_agg(jsonb_build_array(seat_number, guest_id, guest_name) order by seat_number), '[]'::jsonb)
      into v_current
    from event_seat_assignments where event_id = p_event_id and layout_element_id = p_element_id;
    select coalesce(jsonb_agg(jsonb_build_array(e.seat_number, e.guest_id, nullif(btrim(e.guest_name), '')) order by e.seat_number), '[]'::jsonb)
      into v_expected
    from jsonb_to_recordset(p_expected) as e(seat_number integer, guest_id uuid, guest_name text);
    if v_current is distinct from v_expected then
      raise exception 'The table''s list changed since it was loaded.' using errcode = 'S3001';
    end if;
  end if;
  delete from event_seat_assignments where event_id = p_event_id and layout_element_id = p_element_id;
  insert into event_seat_assignments (event_id, room_id, layout_element_id, seat_number, guest_id, guest_name)
  select p_event_id, p_room_id, p_element_id, s.seat_number, s.guest_id, s.guest_name
  from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb)) as s(seat_number integer, guest_id uuid, guest_name text);
end;
$$;

revoke all on function public.replace_table_seats(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_table_seats(uuid, uuid, uuid, jsonb, jsonb) to service_role;
