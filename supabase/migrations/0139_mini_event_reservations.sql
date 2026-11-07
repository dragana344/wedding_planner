-- 0139: Project B §1 — a mini-event's table claim IS a reservations row
-- (the existing table-picker, conflict check and DB-level no-overlap
-- exclusion constraint from migration 0035, now also linkable to the event
-- it belongs to), instead of a second, parallel capacity system built
-- against event_layout_elements. Null for every ordinary reservation.

alter table public.reservations add column event_id uuid references public.events(id) on delete cascade;
create index reservations_event_id_idx on public.reservations(event_id);

-- create_event_full (same signature — no new params: the mini-event's
-- room, start/end time, guest count, name and phone are exactly the event's
-- own p_room_ids[1]/p_start_time/p_end_time/p_guest_count_estimate/
-- p_couple_names/p_contact_phone, already collected for every event). No
-- tables are assigned yet (Project B §2) — that is always a follow-up,
-- staff-assisted step (§3), never part of creation itself.
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
  if p_seating_mode = 'mini' and coalesce(array_length(p_room_ids, 1), 0) <> 1 then
    raise exception 'A mini-event claims exactly one room.' using errcode = '22023';
  end if;
  if p_seating_mode = 'mini' and p_start_time is null then
    raise exception 'A mini-event needs a start time.' using errcode = '22023';
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

revoke all on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text, text) to service_role;

-- erase_event_personal_data (same signature as 0133/0136 — a plain create
-- or replace): a mini-event's linked reservation (§1) carries the couple's
-- own name/phone, duplicated from the event — anonymized the same way the
-- event's own columns just below are, not deleted (the table claim itself
-- is still real, kept business data; only the identifying fields go).
create or replace function public.erase_event_personal_data(
  p_event_id uuid,
  p_actor_id uuid default null,
  p_reason text default 'request',
  p_request_id text default null,
  p_manager_name text default null
)
returns boolean
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue_id uuid;
begin
  perform set_config('app.change_side', 'erase', true);

  select venue_id into v_venue_id from events where id = p_event_id for update;
  if v_venue_id is null then
    return false;
  end if;

  -- Couple access: login and every live session.
  delete from couple_sessions where event_id = p_event_id;
  delete from event_credentials where event_id = p_event_id;

  -- Guests and the couple's planning tools.
  delete from event_guests where event_id = p_event_id;
  delete from event_notes where event_id = p_event_id;
  delete from event_agenda_items where event_id = p_event_id;
  delete from event_locations where event_id = p_event_id;
  delete from event_budget_items where event_id = p_event_id;
  delete from event_checklist_items where event_id = p_event_id; -- subtasks cascade
  delete from event_seating_proposals where event_id = p_event_id;
  -- Guests' menu counts (0119) cascade with event_guests. The menu numbers
  -- sent to the venue stay (counts only); the manager's name and the
  -- allergy summary/raw guest notes (0131 — both can name guests or carry
  -- health data) are cleared.
  update event_menu_submissions
  set seen_by = null, allergy_summary = null, allergy_notes = null
  where event_id = p_event_id and (seen_by is not null or allergy_summary is not null or allergy_notes is not null);

  -- Change marks (0125): the log stays (it is the event's history), minus
  -- contact values and names.
  update event_changes set old_value = null, new_value = null where event_id = p_event_id and section = 'contact';
  update event_changes set changed_by = null where event_id = p_event_id and changed_by is not null;
  update event_change_seen set seen_by = null where event_id = p_event_id and seen_by is not null;
  delete from event_couple_reminders where event_id = p_event_id;

  -- Rows pointing at photos: the 0038 triggers queue their files.
  delete from event_invitations where event_id = p_event_id;
  delete from event_showcase_photos where event_id = p_event_id;

  -- Table labels may name guests ("Table 3 - Petrovski family"). The tables
  -- themselves stay, so the room plan and reservations are unaffected.
  update event_layout_elements set label = null where event_id = p_event_id and label is not null;

  -- Project B §1: the mini-event's own table claim, if any. phone is
  -- not-null on reservations (unlike events.contact_phone), so it gets the
  -- same placeholder as the name rather than null.
  update reservations set guest_name = 'Избришани податоци', phone = '', email = null
  where event_id = p_event_id and guest_name <> 'Избришани податоци';

  update events
  set couple_names = 'Избришани податоци',
      contact_email = null,
      contact_email_2 = null,
      contact_phone = null,
      seating_draft = '{}'::jsonb,
      seating_draft_undo = '{}'::jsonb,
      layout_undo_snapshot = null,
      personal_data_erased_at = now()
  where id = p_event_id;

  -- Files no row points at any more (e.g. replaced invitation photos).
  insert into storage_cleanup_queue (bucket, path)
  select o.bucket_id, o.name
  from storage.objects o
  where ((o.bucket_id = 'invitation-photos' and o.name like p_event_id::text || '-%')
      or (o.bucket_id = 'event-showcase-photos' and o.name like v_venue_id::text || '/' || p_event_id::text || '-%'))
    and not exists (select 1 from storage_cleanup_queue q where q.bucket = o.bucket_id and q.path = o.name);

  insert into audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, request_id, details, manager_name)
  values (
    case when p_actor_id is null then 'system' else 'staff' end,
    p_actor_id, 'event_personal_data_erased', v_venue_id, p_event_id, p_event_id, p_request_id,
    jsonb_build_object('reason', p_reason), p_manager_name
  );
  return true;
end;
$$;
