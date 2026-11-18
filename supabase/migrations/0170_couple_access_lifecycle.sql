-- 0170: couple-access life cycle + automatic retention erasure (group A, task 1).
--
-- The couple has full access until the event day (inclusive, Skopje date),
-- then a read-only "memories" period, then access closes and the event's
-- personal data is erased. When that happens:
--
--   effective end = coalesce(couple_access_extended_until,
--                            couple_access_until,
--                            event_date + 6 months)
--
-- Two separate columns, so a cancellation and an admin extension never
-- overwrite each other:
--   couple_access_until          set ONLY by the status trigger below:
--                                cancelling sets it to the earlier of the
--                                normal end and Skopje-today + 30 days;
--                                reverting the cancellation clears it.
--   couple_access_extended_until set ONLY by the platform admin (audited,
--                                lib/admin/event-actions-core.ts). The
--                                admin's explicit date always wins, also on
--                                a cancelled event; clearing it falls back
--                                to the two rules above.
-- Neither column is personal data.

alter table public.events
  add column couple_access_until date,
  add column couple_access_extended_until date;

create or replace function public.event_access_end(p_event_id uuid)
returns date
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select coalesce(e.couple_access_extended_until, e.couple_access_until, (e.event_date + interval '6 months')::date)
  from events e
  where e.id = p_event_id;
$$;
revoke all on function public.event_access_end(uuid) from public, anon, authenticated;
grant execute on function public.event_access_end(uuid) to service_role;

create or replace function public.events_couple_access_on_status()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if new.status = 'cancelled' then
    new.couple_access_until := least(
      coalesce(old.couple_access_until, (new.event_date + interval '6 months')::date),
      (now() at time zone 'Europe/Skopje')::date + 30
    );
  elsif old.status = 'cancelled' then
    new.couple_access_until := null;
  end if;
  return new;
end;
$$;
revoke all on function public.events_couple_access_on_status() from public, anon, authenticated;

create trigger events_couple_access_on_status
  before update of status on public.events
  for each row
  when (old.status is distinct from new.status)
  execute function public.events_couple_access_on_status();

-- erase_event_personal_data (same signature as 0139 — a plain create or
-- replace). New: an automatic erasure (p_reason = 'retention') keeps the
-- venue's business record of who booked — couple_names, contact_email(_2),
-- contact_phone and a mini-event reservation's guest_name/phone. Everything
-- else goes as before; an erasure for any other reason (a request) still
-- removes those too.
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
  v_keep_organizer boolean := p_reason = 'retention';
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
  -- same placeholder as the name rather than null. On retention the
  -- organizer's name/phone stay (the venue's booking record); email goes.
  if v_keep_organizer then
    update reservations set email = null where event_id = p_event_id and email is not null;
  else
    update reservations set guest_name = 'Избришани податоци', phone = '', email = null
    where event_id = p_event_id and guest_name <> 'Избришани податоци';
  end if;

  update events
  set couple_names = case when v_keep_organizer then couple_names else 'Избришани податоци' end,
      contact_email = case when v_keep_organizer then contact_email end,
      contact_email_2 = case when v_keep_organizer then contact_email_2 end,
      contact_phone = case when v_keep_organizer then contact_phone end,
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

-- The scheduled retention sweep (daily, app/api/cron/retention). Erases
-- every event whose couple access has ended (effective end before today,
-- Skopje date) and deletes contact-form messages older than 6 months.
-- Replaces purge_expired_personal_data (0043, never scheduled), which is
-- left in place.
create or replace function public.purge_expired_event_data()
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Europe/Skopje')::date;
  v_event_id uuid;
  v_events int := 0;
  v_contacts int := 0;
begin
  for v_event_id in
    select id from events
    where personal_data_erased_at is null
      and coalesce(couple_access_extended_until, couple_access_until, (event_date + interval '6 months')::date) < v_today
    order by event_date
  loop
    perform erase_event_personal_data(v_event_id, null, 'retention');
    v_events := v_events + 1;
  end loop;

  delete from contact_submissions
  where created_at < now() - interval '6 months';
  get diagnostics v_contacts = row_count;

  if v_contacts > 0 then
    insert into audit_log (actor_type, action, details)
    values ('system', 'contact_submissions_purged', jsonb_build_object('count', v_contacts, 'months', 6));
  end if;

  return jsonb_build_object('events_erased', v_events, 'contact_submissions_deleted', v_contacts);
end;
$$;
revoke all on function public.purge_expired_event_data() from public, anon, authenticated;
grant execute on function public.purge_expired_event_data() to service_role;
