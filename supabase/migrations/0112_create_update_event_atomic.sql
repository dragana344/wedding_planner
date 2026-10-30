-- 0112: createEvent and updateEvent each did their event row, its rooms (and,
-- for create, the couple's login) as separate statements from the Next.js
-- route — a failure partway (e.g. the rooms insert) left a half-made event
-- with no compensating cleanup for that specific step, and the one cleanup
-- that did exist (deleting the event if credentials creation failed) was
-- itself just more JS that could fail independently of the thing it was
-- cleaning up after. Both are now one Postgres function each: a function
-- body is one implicit transaction, so any failure — the rooms insert, the
-- credentials insert, anything — rolls back everything else the function
-- did. No JS-level compensating cleanup is needed anymore, because a partial
-- write is no longer possible.
--
-- Business-rule validation that must produce a specific, user-facing
-- message (menu template / rooms belonging to this venue) stays in
-- lib/venue/events.ts, run *before* calling these — SEC-003's error-message
-- convention (lib/api/handler.ts's isUserFacingError) only lets a plain
-- `throw new Error(...)` reach the client, never a raw database error, so a
-- message raised from inside a function here could not reach the user
-- anyway. These functions do only the atomic writes themselves.

begin;

create or replace function public.create_event_full(
  p_venue_id uuid,
  p_couple_names text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_type text,
  p_status text,
  p_guest_count_estimate int,
  p_menu_template_id uuid,
  p_room_ids uuid[],
  p_contact_email text,
  p_contact_email_2 text,
  p_contact_phone text,
  p_total_price numeric,
  p_deposit_paid numeric,
  p_username text,
  p_password text
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
    p_guest_count_estimate, p_menu_template_id, p_total_price, p_deposit_paid,
    p_contact_email, p_contact_email_2, p_contact_phone
  )
  returning id into v_event_id;

  if p_room_ids is not null and array_length(p_room_ids, 1) > 0 then
    insert into event_rooms (event_id, room_id)
    select v_event_id, r from unnest(p_room_ids) as r;
  end if;

  -- Raises on its own (short password, etc.); that aborts this whole
  -- function, which rolls back the event and event_rooms inserts above too.
  perform public.create_event_credentials(v_event_id, p_username, p_password);

  return v_event_id;
end;
$$;
revoke all on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid, uuid[], text, text, text, numeric, numeric, text, text) from public, anon, authenticated;
grant execute on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid, uuid[], text, text, text, numeric, numeric, text, text) to service_role;

-- Returns whether the (eventId, venueId) pair matched a row, so the caller
-- can tell a genuine update from one that found nothing to update (another
-- venue's event, or one already deleted) without parsing an error message.
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
  p_menu_template_id uuid,
  p_room_ids uuid[]
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
    menu_template_id = p_menu_template_id
  where id = p_event_id and venue_id = p_venue_id;

  if not found then
    return false;
  end if;

  -- Only the halls that actually changed: removing a hall frees its seats
  -- (0077), so kept halls must not be deleted and re-added — that would
  -- also reset their layout_initialized_at claim.
  delete from event_rooms
  where event_id = p_event_id
    and not (room_id = any(coalesce(p_room_ids, array[]::uuid[])));

  insert into event_rooms (event_id, room_id)
  select p_event_id, r
  from unnest(coalesce(p_room_ids, array[]::uuid[])) as r
  where not exists (select 1 from event_rooms er where er.event_id = p_event_id and er.room_id = r);

  return true;
end;
$$;
revoke all on function public.update_event_full(uuid, uuid, text, date, time, time, text, text, int, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.update_event_full(uuid, uuid, text, date, time, time, text, text, int, uuid, uuid[]) to service_role;

commit;
