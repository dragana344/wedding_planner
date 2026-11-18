-- 0177: 0174's audit rows must not hold names. audit_log is append-only,
-- so anything personal in it could never be erased (6-month retention,
-- erasure requests). Reservation rows keep only the booking's id, date,
-- start/end time, party size, room, the status change and the event id;
-- event_deleted / event_cancelled keep type, date, status and the venue's
-- money — no guest_name, phone, email or couple_names.

begin;

create or replace function public.audit_reservation_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
begin
  v_action := case
    when new.status = 'cancelled' then 'reservation_cancelled'
    when new.status = 'completed' then 'reservation_completed'
    when old.status = 'cancelled' then 'reservation_restored'
  end;
  if v_action is null then
    return new;
  end if;

  insert into audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, details, manager_name)
  values (
    case when v_actor is null then 'system' else 'staff' end, v_actor, v_action, new.venue_id, new.event_id, new.id,
    jsonb_build_object(
      'date', new.date, 'start_time', new.start_time, 'end_time', new.end_time, 'party_size', new.party_size,
      'room_id', new.room_id, 'previous_status', old.status, 'status', new.status
    ),
    nullif(current_setting('app.manager_name', true), '')
  );
  return new;
end;
$$;

create or replace function public.set_reservation_status(
  p_reservation_id uuid,
  p_venue_id uuid,
  p_status text,
  p_actor_id uuid default null,
  p_manager_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_event record;
begin
  if p_status not in ('reserved', 'seated', 'completed', 'cancelled') then
    raise exception 'Invalid reservation status: %', p_status using errcode = '22023';
  end if;
  perform set_config('app.manager_name', coalesce(p_manager_name, ''), true);
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);

  select event_id into v_event_id from reservations where id = p_reservation_id and venue_id = p_venue_id for update;
  if not found then
    return false;
  end if;

  if v_event_id is not null and p_status = 'cancelled' then
    select event_type, event_date, status, total_price, deposit_paid into v_event
    from events where id = v_event_id and venue_id = p_venue_id for update;
    if v_event.status is distinct from 'cancelled' then
      update events set status = 'cancelled' where id = v_event_id and venue_id = p_venue_id;
      insert into audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, details, manager_name)
      values (
        case when p_actor_id is null then 'system' else 'staff' end, p_actor_id, 'event_cancelled', p_venue_id, v_event_id, v_event_id,
        jsonb_build_object(
          'event_type', v_event.event_type, 'event_date', v_event.event_date, 'previous_status', v_event.status,
          'total_price', v_event.total_price, 'deposit_paid', v_event.deposit_paid
        ),
        p_manager_name
      );
    end if;
  end if;
  -- For a mini event the 0174 trigger has usually done this already.
  update reservations set status = p_status where id = p_reservation_id and status is distinct from p_status;
  return true;
end;
$$;

create or replace function public.delete_reservation_as_staff(
  p_reservation_id uuid,
  p_venue_id uuid,
  p_actor_id uuid default null,
  p_manager_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row reservations%rowtype;
begin
  delete from reservations
  where id = p_reservation_id and venue_id = p_venue_id and event_id is null and status in ('cancelled', 'completed')
  returning * into v_row;
  if v_row.id is null then
    return false;
  end if;

  insert into audit_log (actor_type, actor_id, action, venue_id, target_id, details, manager_name)
  values (
    case when p_actor_id is null then 'system' else 'staff' end, p_actor_id, 'reservation_deleted', p_venue_id, v_row.id,
    jsonb_build_object(
      'date', v_row.date, 'start_time', v_row.start_time, 'end_time', v_row.end_time, 'party_size', v_row.party_size,
      'room_id', v_row.room_id, 'status', v_row.status
    ),
    p_manager_name
  );
  return true;
end;
$$;

-- audit_staff_action (0174 body): event_deleted keeps type, date, status and
-- the venue's money, never couple_names. The money only for a single
-- event's delete, not for one cascaded by a venue account deletion (the
-- venue row is already gone then), which is a full deletion.
create or replace function public.audit_staff_action()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_venue_id uuid;
  v_action text;
  v_details jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'events' then
    v_event_id := old.id;
    v_venue_id := old.venue_id;
    v_action := 'event_deleted';
    v_details := jsonb_build_object('event_date', old.event_date, 'event_type', old.event_type, 'status', old.status);
    if exists (select 1 from public.venues where id = old.venue_id) then
      v_details := v_details || jsonb_build_object(
        'start_time', old.start_time, 'seating_mode', old.seating_mode,
        'total_price', old.total_price, 'deposit_paid', old.deposit_paid
      );
    end if;
  else -- event_credentials
    v_event_id := new.event_id;
    select venue_id into v_venue_id from public.events where id = v_event_id;
    v_action := case when tg_op = 'INSERT' then 'couple_credentials_created' else 'couple_password_regenerated' end;
  end if;

  insert into public.audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, details, manager_name)
  values (
    case when auth.uid() is null then 'system' else 'staff' end, auth.uid(), v_action, v_venue_id, v_event_id, v_event_id, v_details,
    nullif(current_setting('app.manager_name', true), '')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

commit;
