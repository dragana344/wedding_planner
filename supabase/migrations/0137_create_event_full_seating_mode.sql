-- 0137: Project A §1/§3 — event creation picks a seating_mode, and a
-- `full` event's baseline (spec §3) is captured right here, from each
-- assigned room's current standard layout (room_layout_elements) — not
-- from event_layout_elements, which isn't populated yet at this point
-- (it's seeded lazily, on first visit to the seating page). Keyed by
-- room_id, same shape as events.seating_draft, since an event can span
-- more than one room.

begin;

drop function if exists public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text);

create or replace function public.create_event_full(
  p_venue_id uuid,
  p_couple_names text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_type text,
  p_status text,
  p_guest_count_estimate int,
  p_room_ids uuid[],
  p_contact_email text,
  p_contact_email_2 text,
  p_contact_phone text,
  p_total_price numeric,
  p_deposit_paid numeric,
  p_username text,
  p_password text,
  p_menu_template_ids uuid[],
  p_manager_name text default null,
  p_seating_mode text default 'full'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
begin
  if p_seating_mode not in ('full', 'mini') then
    raise exception 'Invalid seating_mode: %', p_seating_mode using errcode = '22023';
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
      update events set seating_baseline = (
        select coalesce(jsonb_object_agg(r.id, coalesce(els.elements, '[]'::jsonb)), '{}'::jsonb)
        from unnest(p_room_ids) as r(id)
        left join lateral (
          select jsonb_agg(jsonb_build_object(
            'id', rle.id, 'element_type', rle.element_type, 'table_type_id', rle.table_type_id,
            'x_cm', rle.x_cm, 'y_cm', rle.y_cm, 'width_cm', rle.width_cm, 'length_cm', rle.length_cm,
            'rotation_deg', rle.rotation_deg, 'label', rle.label, 'group_id', rle.group_id, 'table_role', rle.table_role
          )) as elements
          from room_layout_elements rle where rle.room_id = r.id
        ) els on true
      ) where id = v_event_id;
    end if;
  end if;

  if p_menu_template_ids is not null and array_length(p_menu_template_ids, 1) > 0 then
    insert into event_menu_templates (event_id, menu_template_id)
    select v_event_id, m from (select distinct unnest(p_menu_template_ids) as m) as d;
  end if;

  -- Raises on its own (short password, etc.); that aborts this whole
  -- function, which rolls back the event, rooms and menu inserts too.
  perform public.create_event_credentials(v_event_id, p_username, p_password);

  return v_event_id;
end;
$$;

revoke all on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text, text) to service_role;

commit;
