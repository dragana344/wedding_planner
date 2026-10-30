-- Events carry a list of menus. create_event_full / update_event_full take
-- p_menu_template_ids and drop the scalar p_menu_template_id. events.menu_template_id
-- is still kept in sync to the first menu (null when none) so the readers that
-- still use it keep working until it is removed.

begin;

drop function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid, uuid[], text, text, text, numeric, numeric, text, text, uuid[]);
drop function public.update_event_full(uuid, uuid, text, date, time, time, text, text, int, uuid, uuid[]);

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
  p_menu_template_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
begin
  insert into events (
    venue_id, couple_names, event_date, start_time, end_time, event_type, status,
    guest_count_estimate, menu_template_id, total_price, deposit_paid,
    contact_email, contact_email_2, contact_phone
  ) values (
    p_venue_id, p_couple_names, p_event_date, p_start_time, p_end_time, p_event_type, p_status,
    p_guest_count_estimate, p_menu_template_ids[1], p_total_price, p_deposit_paid,
    p_contact_email, p_contact_email_2, p_contact_phone
  )
  returning id into v_event_id;

  if p_room_ids is not null and array_length(p_room_ids, 1) > 0 then
    insert into event_rooms (event_id, room_id)
    select v_event_id, r from unnest(p_room_ids) as r;
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
revoke all on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[]) to service_role;

create or replace function public.update_event_full(
  p_event_id uuid,
  p_venue_id uuid,
  p_couple_names text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_type text,
  p_status text,
  p_guest_count_estimate int,
  p_room_ids uuid[],
  p_menu_template_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update events set
    couple_names = p_couple_names,
    event_date = p_event_date,
    start_time = p_start_time,
    end_time = p_end_time,
    event_type = p_event_type,
    status = p_status,
    guest_count_estimate = p_guest_count_estimate,
    menu_template_id = p_menu_template_ids[1]
  where id = p_event_id and venue_id = p_venue_id;

  if not found then
    return false;
  end if;

  delete from event_rooms
  where event_id = p_event_id
    and not (room_id = any(coalesce(p_room_ids, array[]::uuid[])));

  insert into event_rooms (event_id, room_id)
  select p_event_id, r
  from unnest(coalesce(p_room_ids, array[]::uuid[])) as r
  where not exists (select 1 from event_rooms er where er.event_id = p_event_id and er.room_id = r);

  -- Only the menus that changed: unlinking one deletes the guests' counts for
  -- it (trigger from 0119), kept menus keep theirs.
  delete from event_menu_templates
  where event_id = p_event_id
    and not (menu_template_id = any(coalesce(p_menu_template_ids, array[]::uuid[])));

  insert into event_menu_templates (event_id, menu_template_id)
  select p_event_id, m
  from (select distinct unnest(coalesce(p_menu_template_ids, array[]::uuid[])) as m) as d
  where not exists (select 1 from event_menu_templates em where em.event_id = p_event_id and em.menu_template_id = d.m);

  return true;
end;
$$;
revoke all on function public.update_event_full(uuid, uuid, text, date, time, time, text, text, int, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.update_event_full(uuid, uuid, text, date, time, time, text, text, int, uuid[], uuid[]) to service_role;

commit;
