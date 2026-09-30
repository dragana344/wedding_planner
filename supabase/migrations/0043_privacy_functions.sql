-- 0043 (DATA-005 / DATA-007): personal-data erasure and retention mechanism.
--
--   erase_event_personal_data(event, actor, reason, request_id)
--       Removes everything personal about one event's couple and guests in a
--       single transaction, keeps the event row itself (date, rooms, status,
--       menu template, finance) so the venue's calendar and reports stay
--       intact, and writes one audit row.
--   delete_venue_account(venue, actor, request_id)
--       Deletes the venue (cascading every room, event, reservation, guest...)
--       and returns the staff user ids that belong to no other venue, so the
--       caller can delete those auth users through the Auth admin API.
--   purge_expired_personal_data(guest_data_months, contact_months)
--       Retention sweep (DATA-007). NOT scheduled here: the periods are an
--       open owner decision, see docs/production/RETENTION.md.
--
-- Storage objects cannot be deleted from SQL. Deleting rows with a
-- photo_path queues their files (0038 triggers); these functions also queue
-- any other object under the subject's paths (older replaced photos). The
-- caller drains the queue (lib/storage-cleanup.ts); the hourly cron does it
-- otherwise.
--
-- All three are called by server code with the service-role client (or by
-- pg_cron as postgres), never from the browser: no SECURITY DEFINER, execute
-- granted to service_role only.

-- Marker so the retention sweep skips events already erased, and the panel
-- can tell. Not personal.
alter table public.events add column personal_data_erased_at timestamptz;

create or replace function public.erase_event_personal_data(
  p_event_id uuid,
  p_actor_id uuid default null,
  p_reason text default 'request',
  p_request_id text default null
)
returns boolean
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue_id uuid;
begin
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
  delete from event_custom_menu_items where event_id = p_event_id;
  delete from event_menu_item_quantities where event_id = p_event_id;

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

  insert into audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, request_id, details)
  values (
    case when p_actor_id is null then 'system' else 'staff' end,
    p_actor_id, 'event_personal_data_erased', v_venue_id, p_event_id, p_event_id, p_request_id,
    jsonb_build_object('reason', p_reason)
  );
  return true;
end;
$$;

create or replace function public.delete_venue_account(
  p_venue_id uuid,
  p_actor_id uuid default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_ids uuid[];
  v_event_ids text[];
  v_events int;
begin
  perform 1 from venues where id = p_venue_id for update;
  if not found then
    return null;
  end if;

  select coalesce(array_agg(vs.user_id), '{}') into v_user_ids
  from venue_staff vs
  where vs.venue_id = p_venue_id
    and not exists (select 1 from venue_staff o where o.user_id = vs.user_id and o.venue_id <> p_venue_id);

  select coalesce(array_agg(id::text), '{}'), count(*) into v_event_ids, v_events
  from events where venue_id = p_venue_id;

  -- Cascades to rooms, menus, events (and everything under them),
  -- reservations and venue_staff. Photo rows queue their files (0038).
  delete from venues where id = p_venue_id;

  -- Everything else stored under the venue's or its events' paths.
  insert into storage_cleanup_queue (bucket, path)
  select o.bucket_id, o.name
  from storage.objects o
  where ((o.bucket_id in ('menu-item-photos', 'event-showcase-photos') and o.name like p_venue_id::text || '/%')
      or (o.bucket_id = 'invitation-photos' and left(o.name, 36) = any (v_event_ids) and substr(o.name, 37, 1) = '-'))
    and not exists (select 1 from storage_cleanup_queue q where q.bucket = o.bucket_id and q.path = o.name);

  insert into audit_log (actor_type, actor_id, action, venue_id, target_id, request_id, details)
  values (
    case when p_actor_id is null then 'system' else 'staff' end,
    p_actor_id, 'venue_account_deleted', p_venue_id, p_venue_id, p_request_id,
    jsonb_build_object('events', v_events, 'staff_accounts', coalesce(array_length(v_user_ids, 1), 0))
  );

  return jsonb_build_object('user_ids', to_jsonb(v_user_ids), 'events', v_events);
end;
$$;

create or replace function public.purge_expired_personal_data(p_guest_data_months int, p_contact_months int)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
  v_events int := 0;
  v_contacts int := 0;
begin
  if p_guest_data_months is null or p_guest_data_months < 1 or p_contact_months is null or p_contact_months < 1 then
    raise exception 'Retention periods must be at least one month.' using errcode = '22023';
  end if;

  for v_event_id in
    select id from events
    where personal_data_erased_at is null
      and event_date < (current_date - make_interval(months => p_guest_data_months))::date
    order by event_date
  loop
    perform erase_event_personal_data(v_event_id, null, 'retention');
    v_events := v_events + 1;
  end loop;

  delete from contact_submissions
  where created_at < now() - make_interval(months => p_contact_months);
  get diagnostics v_contacts = row_count;

  if v_contacts > 0 then
    insert into audit_log (actor_type, action, details)
    values ('system', 'contact_submissions_purged', jsonb_build_object('count', v_contacts, 'months', p_contact_months));
  end if;

  return jsonb_build_object('events_erased', v_events, 'contact_submissions_deleted', v_contacts);
end;
$$;

revoke all on function public.erase_event_personal_data(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_venue_account(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.purge_expired_personal_data(int, int) from public, anon, authenticated;

grant execute on function public.erase_event_personal_data(uuid, uuid, text, text) to service_role;
grant execute on function public.delete_venue_account(uuid, uuid, text) to service_role;
grant execute on function public.purge_expired_personal_data(int, int) to service_role;
