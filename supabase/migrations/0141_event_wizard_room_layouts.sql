-- 0141: the event-creation wizard now lets the manager resolve each
-- selected room's starting table layout explicitly (pick one of
-- room_layout_presets' saved snapshots, or build one from scratch right in
-- the wizard) instead of create_event_full always silently copying whatever
-- the room's live template currently looks like.
--
-- p_room_layouts, when given, is a jsonb object keyed by room_id (text) to
-- a jsonb array of elements shaped like SnapshotElement (lib/venue/
-- room-presets.ts) — no `id` (fresh ones are minted below) and no `room_id`
-- (implied by the key). When given, it must cover every room in
-- p_room_ids — the wizard always resolves every selected room before
-- submitting, so a gap means a caller bug, not a legitimate partial case.
-- Omitted/null keeps today's auto-copy behaviour untouched, so any existing
-- caller that doesn't pass it (tests, scripts) is unaffected.
--
-- The chosen elements are inserted straight into event_layout_elements —
-- the same table the staff seating editor (EventSeatingPage.tsx) reads from
-- via initializeEventLayoutFromStandard — and that room's event_rooms.
-- layout_initialized_at is claimed immediately, so that lazy copy-from-the-
-- room's-live-template never fires and overwrites the manager's choice.
-- seating_baseline (what the couple's side reads) is then built by reading
-- those same freshly-inserted rows back, so staff and couple start from
-- identical element ids, not two independently-generated copies.

drop function if exists public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text, text);

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
  p_seating_mode text default 'full',
  p_room_layouts jsonb default null
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
          rotation_deg, label, group_id, table_role, created_at
        )
        select
          gen_random_uuid(), v_event_id, r.id,
          elem->>'element_type', (elem->>'table_type_id')::uuid,
          (elem->>'x_cm')::numeric, (elem->>'y_cm')::numeric, (elem->>'width_cm')::numeric, (elem->>'length_cm')::numeric,
          coalesce((elem->>'rotation_deg')::numeric, 0), elem->>'label', (elem->>'group_id')::uuid,
          coalesce(elem->>'table_role', 'guest'),
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
              'rotation_deg', ele.rotation_deg, 'label', ele.label, 'group_id', ele.group_id, 'table_role', ele.table_role
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
              'rotation_deg', rle.rotation_deg, 'label', rle.label, 'group_id', rle.group_id, 'table_role', rle.table_role
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
$$;

revoke all on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text, text, jsonb) to service_role;
