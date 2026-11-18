-- 0174 (group A, task 4): "Откажи" keeps the record; hard delete is a
-- separate, confirmed and audited action.
--
-- Before this, cancelling a reservation (or "guests left") deleted the row,
-- and cancelling a mini event deleted the whole event. Now:
--   * a reservation's status goes to 'cancelled' / 'completed' and the row
--     stays (0035 already lets those statuses stop holding their tables);
--   * cancelling a mini event sets the EVENT to 'cancelled' (so 0170's
--     30-day couple-access rule applies) and its reservation follows;
--   * "Избриши засекогаш" removes only an already cancelled/completed
--     ordinary reservation.
-- Every one of these writes an audit_log row, attributed to the elevated
-- manager when there is one (0133's pattern: the name travels into the same
-- function call that performs the write).
--
-- The details of these rows (and of event_deleted below) carry the booking's
-- name, date, time and size, as the venue's own record of what was
-- cancelled or removed — the user asked for this explicitly, since after a
-- hard delete the audit row is the only trace left.

begin;

-- Status changes on reservations, from any path (the venue routes below, or
-- the browser's own RLS-bound writes). Only transitions that matter for the
-- record are logged: into cancelled/completed, and back out of cancelled.
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
      'guest_name', new.guest_name, 'date', new.date, 'start_time', new.start_time,
      'party_size', new.party_size, 'previous_status', old.status
    ),
    nullif(current_setting('app.manager_name', true), '')
  );
  return new;
end;
$$;

revoke all on function public.audit_reservation_status() from public, anon, authenticated;

create trigger reservations_audit_status
  after update of status on public.reservations
  for each row
  when (old.status is distinct from new.status)
  execute function public.audit_reservation_status();

-- A mini event's reservation follows its event: cancelling the event frees
-- its tables, reverting the cancellation books them again. When the tables
-- were taken in the meantime (0035's no-overlap constraint), the
-- reservation comes back without tables and staff pick new ones on the
-- event's Маси tab — reverting the event itself never fails over it.
-- Skipped for a venue whose plan no longer has reservations (0049 refuses
-- any reservation write there; cancelling the event must still work).
create or replace function public.events_sync_mini_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not venue_has_feature(new.venue_id, 'reservations') then
    return new;
  end if;
  if new.status = 'cancelled' then
    update reservations set status = 'cancelled'
    where event_id = new.id and status in ('reserved', 'seated');
  elsif old.status = 'cancelled' then
    begin
      update reservations set status = 'reserved' where event_id = new.id and status = 'cancelled';
    exception when exclusion_violation then
      delete from reservation_tables
      where reservation_id in (select id from reservations where event_id = new.id and status = 'cancelled');
      update reservations set status = 'reserved' where event_id = new.id and status = 'cancelled';
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.events_sync_mini_reservation() from public, anon, authenticated;

create trigger events_sync_mini_reservation
  after update of status on public.events
  for each row
  when (old.status is distinct from new.status)
  execute function public.events_sync_mini_reservation();

-- The venue's reservation routes (app/api/venue/reservations/[id]) call
-- these with the service-role client after checking the caller's venue, so
-- p_venue_id scopes the write and p_actor_id / p_manager_name say who.
--
-- set_reservation_status: an ordinary reservation's status, or — for a mini
-- event's reservation set to 'cancelled' — the event's own status (the
-- trigger above then cancels the reservation). Returns false when no such
-- reservation exists at this venue.
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
    select couple_names, event_type, event_date, status, total_price, deposit_paid into v_event
    from events where id = v_event_id and venue_id = p_venue_id for update;
    if v_event.status is distinct from 'cancelled' then
      update events set status = 'cancelled' where id = v_event_id and venue_id = p_venue_id;
      insert into audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, details, manager_name)
      values (
        case when p_actor_id is null then 'system' else 'staff' end, p_actor_id, 'event_cancelled', p_venue_id, v_event_id, v_event_id,
        jsonb_build_object(
          'couple_names', v_event.couple_names, 'event_type', v_event.event_type, 'event_date', v_event.event_date,
          'previous_status', v_event.status, 'total_price', v_event.total_price, 'deposit_paid', v_event.deposit_paid
        ),
        p_manager_name
      );
    end if;
  end if;
  -- For a mini event the trigger above has usually done this already.
  update reservations set status = p_status where id = p_reservation_id and status is distinct from p_status;
  return true;
end;
$$;

revoke all on function public.set_reservation_status(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_reservation_status(uuid, uuid, text, uuid, text) to service_role;

-- delete_reservation_as_staff: "Избриши засекогаш". Only an ordinary
-- reservation that is already cancelled or completed — a mini event's
-- reservation goes with its event (the event's own delete), and an active
-- booking is cancelled first. Returns false when nothing matched.
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
      'guest_name', v_row.guest_name, 'date', v_row.date, 'start_time', v_row.start_time,
      'party_size', v_row.party_size, 'status', v_row.status
    ),
    p_manager_name
  );
  return true;
end;
$$;

revoke all on function public.delete_reservation_as_staff(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_reservation_as_staff(uuid, uuid, uuid, text) to service_role;

-- audit_staff_action (0133 body): an event_deleted row now also keeps who
-- the event was for, its type and the venue's money — the event row itself
-- is gone after this, so the audit row is the venue's only record of it.
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
    -- Not when the whole venue account is being deleted (the cascade from
    -- venues runs after the venue row is gone): that is a full deletion,
    -- and the per-event rows must not keep every couple's name.
    if exists (select 1 from public.venues where id = old.venue_id) then
      v_details := v_details || jsonb_build_object(
        'couple_names', old.couple_names, 'start_time', old.start_time, 'seating_mode', old.seating_mode,
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
