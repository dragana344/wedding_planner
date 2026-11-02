-- 0133: audit_log can say "a manager did this" but never which one once a
-- venue has 2+ managers (the manager-elevation layer is checked one level
-- above where these rows get written, and the two were never connected).
--
-- Fix: every gated write that already re-verifies manager elevation before
-- it runs now passes the manager's name into the SAME function call that
-- performs the write — never a separate round trip first, since Supabase's
-- connection pooling does not guarantee two separate client calls land on
-- the same backend session, so a `set_config(..., true)` (transaction-local)
-- made before a later, separate write would not reliably be visible to it.
-- The trigger-based actions (event_deleted, couple_credentials_created,
-- couple_password_regenerated) read the name back via `current_setting`
-- from inside that same transaction; the two actions that already write
-- their own audit_log row explicitly (event_personal_data_erased,
-- privacy_export) just take the name as a plain argument instead.
--
-- manager_name is never nulled by event erasure, unlike event_changes'
-- near-identical changed_by/seen_by: audit_log is append-only (0042's
-- audit_log_append_only trigger raises on any update or delete of an
-- existing row, by design — SEC-018), so it is already excluded from the
-- blanket post-erasure checks in privacy.test.ts, same as its actor_id
-- column today.

begin;

alter table public.audit_log add column manager_name text
  check (manager_name is null or char_length(manager_name) <= 100);

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

-- regenerate_event_password (0045, manager-gated by 0103): the route already
-- re-verifies elevation before calling this, so the manager's name travels
-- in as an argument.
drop function if exists public.regenerate_event_password(uuid, text);

create or replace function public.regenerate_event_password(p_event_id uuid, p_password text, p_manager_name text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from events where id = p_event_id and is_venue_staff_for(venue_id)
  ) then
    raise exception 'Not authorized to change credentials for this event.';
  end if;
  if char_length(coalesce(p_password, '')) < 10 then
    raise exception 'Лозинката мора да има најмалку 10 знаци.' using errcode = '22023';
  end if;
  perform set_config('app.manager_name', p_manager_name, true);
  update event_credentials
    set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), failed_attempts = 0, locked_until = null
    where event_id = p_event_id;
  delete from couple_sessions where event_id = p_event_id;
end;
$$;

revoke all on function public.regenerate_event_password(uuid, text, text) from public, anon, authenticated;
grant execute on function public.regenerate_event_password(uuid, text, text) to service_role;

-- New: deleteEvent (lib/venue/events.ts) used a plain `delete from events`
-- call, which the events_audit_delete trigger already covers for action +
-- actor, but had no way to receive the manager's name — this gives it one,
-- replacing that plain delete.
create or replace function public.delete_event_as_manager(p_event_id uuid, p_venue_id uuid, p_manager_name text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted uuid;
begin
  perform set_config('app.manager_name', p_manager_name, true);
  delete from events where id = p_event_id and venue_id = p_venue_id returning id into v_deleted;
  return v_deleted is not null;
end;
$$;

revoke all on function public.delete_event_as_manager(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_event_as_manager(uuid, uuid, text) to service_role;

-- create_event_full (0112, extended since): the couple-credentials insert
-- inside it fires event_credentials_audit_insert, same reasoning as above.
drop function if exists public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[]);

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
  p_manager_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
begin
  perform set_config('app.manager_name', p_manager_name, true);

  insert into events (
    venue_id, couple_names, event_date, start_time, end_time, event_type, status,
    guest_count_estimate, total_price, deposit_paid,
    contact_email, contact_email_2, contact_phone
  ) values (
    p_venue_id, p_couple_names, p_event_date, p_start_time, p_end_time, p_event_type, p_status,
    p_guest_count_estimate, p_total_price, p_deposit_paid,
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

revoke all on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text) from public, anon, authenticated;
grant execute on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid[], text, text, text, numeric, numeric, text, text, uuid[], text) to service_role;

-- erase_event_personal_data (0122, most recently extended by 0132): the
-- erasure route is manager-gated too, same as the others. It already writes
-- its own audit_log row explicitly, so the name is just a plain argument.
drop function if exists public.erase_event_personal_data(uuid, uuid, text, text);

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

revoke all on function public.erase_event_personal_data(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.erase_event_personal_data(uuid, uuid, text, text, text) to service_role;

commit;
