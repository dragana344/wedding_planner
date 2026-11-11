-- 0146: three more functions that reconstruct event_layout_elements rows
-- from jsonb must carry the new shape column (0145) through too, or a
-- decorative element's shape silently drops whenever a seating proposal is
-- approved, staff undoes/redoes a layout edit, or an event is created with
-- an explicit custom room layout from the wizard.

begin;

create or replace function public.confirm_event_seating(p_event_id uuid, p_room_id uuid, p_elements jsonb, p_confirmed_at text)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  delete from event_layout_elements where event_id = p_event_id and room_id = p_room_id;
  insert into event_layout_elements (id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm,
                                     rotation_deg, label, group_id, table_role, shape, created_at)
  select coalesce(e.id, gen_random_uuid()), p_event_id, p_room_id, e.element_type,
         (select tt.id from table_types tt where tt.id = e.table_type_id and tt.room_id = p_room_id),
         e.x_cm, e.y_cm, e.width_cm, e.length_cm, e.rotation_deg, e.label, e.group_id, coalesce(e.table_role, 'guest'), e.shape,
         now() + (x.ord * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p_elements, '[]'::jsonb)) with ordinality as x(value, ord)
  cross join lateral jsonb_to_record(x.value) as e(
    id uuid, element_type text, table_type_id uuid, x_cm numeric, y_cm numeric,
    width_cm numeric, length_cm numeric, rotation_deg numeric, label text, group_id uuid, table_role text, shape text
  );
  update events
  set seating_confirmed_at = coalesce(seating_confirmed_at, '{}'::jsonb) || jsonb_build_object(p_room_id::text, p_confirmed_at)
  where id = p_event_id;
end;
$function$;

create or replace function public.restore_staff_layout(p_event_id uuid, p_room_id uuid, p_elements jsonb, p_seats jsonb)
returns integer
language plpgsql
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_seat record;
  v_restored integer := 0;
begin
  delete from event_layout_elements where event_id = p_event_id and room_id = p_room_id;
  insert into event_layout_elements (id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm,
                                     rotation_deg, label, group_id, table_role, shape, created_at)
  select e.id, p_event_id, p_room_id, e.element_type,
         (select tt.id from table_types tt where tt.id = e.table_type_id and tt.room_id = p_room_id),
         e.x_cm, e.y_cm, e.width_cm, e.length_cm, coalesce(e.rotation_deg, 0), e.label, e.group_id,
         coalesce(e.table_role, 'guest'), e.shape, now() + (x.ord * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p_elements, '[]'::jsonb)) with ordinality as x(value, ord)
  cross join lateral jsonb_to_record(x.value) as e(
    id uuid, element_type text, table_type_id uuid, x_cm numeric, y_cm numeric,
    width_cm numeric, length_cm numeric, rotation_deg numeric, label text, group_id uuid, table_role text, shape text
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
$function$;

create or replace function public.create_event_full(p_venue_id uuid, p_couple_names text, p_event_date date, p_start_time time, p_end_time time,
  p_event_type text, p_status text, p_guest_count_estimate int, p_room_ids uuid[], p_contact_email text,
  p_contact_email_2 text, p_contact_phone text, p_total_price numeric, p_deposit_paid numeric,
  p_username text, p_password text, p_menu_template_ids uuid[],
  p_manager_name text default null, p_seating_mode text default 'full', p_room_layouts jsonb default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_event_id uuid;
begin
  if p_seating_mode not in ('full', 'mini') then
    raise exception 'Invalid seating_mode: %', p_seating_mode using errcode = '22023';
  end if;
  if p_seating_mode = 'mini' and coalesce(array_length(p_room_ids, 1), 0) <> 1 then
    raise exception 'A mini-event claims exactly one room.' using errcode = '22023';
  end if;
  if p_seating_mode = 'mini' and p_start_time is null then
    raise exception 'A mini-event needs a start time.' using errcode = '22023';
  end if;
  if p_room_layouts is not null and exists (
    select 1 from unnest(p_room_ids) as r(id) where not (p_room_layouts ? r.id::text)
  ) then
    raise exception 'p_room_layouts is missing an entry for one or more selected rooms.' using errcode = '22023';
  end if;

  perform set_config('app.manager_name', p_manager_name, true);

  insert into events (
    venue_id, couple_names, event_date, start_time, end_time, event_type, status,
    guest_count_estimate, total_price, deposit_paid,
    contact_email, contact_email_2, contact_phone, seating_mode
  ) values (
    p_venue_id, p_couple_names, p_event_date, p_start_time, p_end_time, p_event_type, p_status,
    p_guest_count_estimate, p_total_price, p_deposit_paid,
    p_contact_email, p_contact_email_2, p_contact_phone, p_seating_mode
  )
  returning id into v_event_id;

  if p_room_ids is not null and array_length(p_room_ids, 1) > 0 then
    insert into event_rooms (event_id, room_id)
    select v_event_id, r from unnest(p_room_ids) as r;

    if p_seating_mode = 'full' then
      if p_room_layouts is not null then
        insert into event_layout_elements (
          id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm,
          rotation_deg, label, group_id, table_role, shape, created_at
        )
        select
          gen_random_uuid(), v_event_id, r.id,
          elem->>'element_type', (elem->>'table_type_id')::uuid,
          (elem->>'x_cm')::numeric, (elem->>'y_cm')::numeric, (elem->>'width_cm')::numeric, (elem->>'length_cm')::numeric,
          coalesce((elem->>'rotation_deg')::numeric, 0), elem->>'label', (elem->>'group_id')::uuid,
          coalesce(elem->>'table_role', 'guest'), elem->>'shape',
          now() + (idx * interval '1 millisecond')
        from unnest(p_room_ids) as r(id)
        cross join lateral jsonb_array_elements(p_room_layouts -> r.id::text) with ordinality as e(elem, idx);

        update event_rooms set layout_initialized_at = now() where event_id = v_event_id;

        update events set seating_baseline = (
          select coalesce(jsonb_object_agg(r.id, coalesce(els.elements, '[]'::jsonb)), '{}'::jsonb)
          from unnest(p_room_ids) as r(id)
          left join lateral (
            select jsonb_agg(jsonb_build_object(
              'id', ele.id, 'element_type', ele.element_type, 'table_type_id', ele.table_type_id,
              'x_cm', ele.x_cm, 'y_cm', ele.y_cm, 'width_cm', ele.width_cm, 'length_cm', ele.length_cm,
              'rotation_deg', ele.rotation_deg, 'label', ele.label, 'group_id', ele.group_id, 'table_role', ele.table_role, 'shape', ele.shape
            )) as elements
            from event_layout_elements ele where ele.event_id = v_event_id and ele.room_id = r.id
          ) els on true
        ) where id = v_event_id;
      else
        update events set seating_baseline = (
          select coalesce(jsonb_object_agg(r.id, coalesce(els.elements, '[]'::jsonb)), '{}'::jsonb)
          from unnest(p_room_ids) as r(id)
          left join lateral (
            select jsonb_agg(jsonb_build_object(
              'id', rle.id, 'element_type', rle.element_type, 'table_type_id', rle.table_type_id,
              'x_cm', rle.x_cm, 'y_cm', rle.y_cm, 'width_cm', rle.width_cm, 'length_cm', rle.length_cm,
              'rotation_deg', rle.rotation_deg, 'label', rle.label, 'group_id', rle.group_id, 'table_role', rle.table_role, 'shape', rle.shape
            )) as elements
            from room_layout_elements rle where rle.room_id = r.id
          ) els on true
        ) where id = v_event_id;
      end if;
    elsif p_seating_mode = 'mini' then
      insert into reservations (venue_id, room_id, event_id, guest_name, phone, date, start_time, end_time, party_size, status)
      values (p_venue_id, p_room_ids[1], v_event_id, p_couple_names, p_contact_phone, p_event_date, p_start_time, p_end_time, greatest(coalesce(p_guest_count_estimate, 1), 1), 'reserved');
    end if;
  end if;

  if p_menu_template_ids is not null and array_length(p_menu_template_ids, 1) > 0 then
    insert into event_menu_templates (event_id, menu_template_id)
    select v_event_id, m from (select distinct unnest(p_menu_template_ids) as m) as d;
  end if;

  -- Raises on its own (short password, etc.); that aborts this whole
  -- function, which rolls back the event, rooms, reservation and menu
  -- inserts too.
  perform public.create_event_credentials(v_event_id, p_username, p_password);

  return v_event_id;
end;
$function$;

commit;
