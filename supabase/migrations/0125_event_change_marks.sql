-- 0125: change marks (Part 1). Every change to an event's planning details —
-- date/time, rooms, menus, guest count, contact, finance — is recorded with
-- the side that made it (venue or couple), so the other side can be shown
-- what changed since they last pressed "Видено".
--
-- * event_changes: the change log, written only by the triggers below and by
--   replace_menu_template_items (custom menus' dishes).
-- * event_change_seen: per event, viewer and section, how far that side has
--   seen. menu_numbers / guest_replies are seen-only sections (no log rows).
-- * event_couple_reminders: the venue reminding the couple to send numbers.
-- * events.couple_first_login_at: couple marks only count after it.
-- * event_menu_submissions.source / unanswered: who produced a submission
--   (the couple, the auto-send, or the venue) and, for an auto-send, how many
--   guests had not answered.
--
-- Side: recorders read the transaction-local setting app.change_side —
-- 'couple' ⇒ the couple's change, 'erase' ⇒ record nothing (personal-data
-- erasure is never a change), anything else ⇒ the venue's. app.change_by is
-- the display name of who made it (null when empty). The couple-side RPCs
-- below set both; venue code paths need do nothing.

begin;

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------

create table public.event_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  section text not null check (section in ('date_time', 'rooms', 'menus', 'guest_count', 'contact', 'finance')),
  side text not null check (side in ('venue', 'couple')),
  changed_by text null,
  field text not null,
  old_value jsonb null,
  new_value jsonb null,
  changed_at timestamptz not null default clock_timestamp()
);
create index event_changes_event_id_changed_at_idx on public.event_changes (event_id, changed_at desc);

create table public.event_change_seen (
  event_id uuid not null references events(id) on delete cascade,
  viewer text not null check (viewer in ('venue', 'couple')),
  section text not null check (
    section in ('date_time', 'rooms', 'menus', 'guest_count', 'contact', 'finance', 'menu_numbers', 'guest_replies')
  ),
  seen_up_to timestamptz not null,
  seen_by text null,
  primary key (event_id, viewer, section)
);

create table public.event_couple_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  reminded_at timestamptz not null default now(),
  reminded_by text not null
);
create index event_couple_reminders_event_id_idx on public.event_couple_reminders (event_id);

-- Service role only: no policies, no API-role grants.
alter table public.event_changes enable row level security;
alter table public.event_change_seen enable row level security;
alter table public.event_couple_reminders enable row level security;
revoke all on public.event_changes from anon, authenticated;
revoke all on public.event_change_seen from anon, authenticated;
revoke all on public.event_couple_reminders from anon, authenticated;
grant all on public.event_changes to service_role;
grant all on public.event_change_seen to service_role;
grant all on public.event_couple_reminders to service_role;

-- Not added to 0117's staff column grant (fail-closed).
alter table public.events add column couple_first_login_at timestamptz null;

alter table public.event_menu_submissions
  add column source text not null default 'couple' check (source in ('couple', 'auto', 'venue')),
  add column unanswered int null;

-- ---------------------------------------------------------------------------
-- Recorder
-- ---------------------------------------------------------------------------

-- One change row, unless this is an erasure or the event is being deleted
-- (a cascade from events reaches the child tables after the event row is
-- gone; inserting would violate the foreign key).
create function public.record_event_change(
  p_event_id uuid,
  p_section text,
  p_field text,
  p_old jsonb,
  p_new jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_side text := coalesce(current_setting('app.change_side', true), '');
begin
  if v_side = 'erase' then
    return;
  end if;
  if not exists (select 1 from events where id = p_event_id) then
    return;
  end if;
  insert into event_changes (event_id, section, side, changed_by, field, old_value, new_value)
  values (
    p_event_id, p_section,
    case when v_side = 'couple' then 'couple' else 'venue' end,
    nullif(current_setting('app.change_by', true), ''),
    p_field, p_old, p_new
  );
end;
$$;
revoke all on function public.record_event_change(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_event_change(uuid, text, text, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.record_event_detail_changes()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if (old.event_date, old.start_time, old.end_time) is distinct from (new.event_date, new.start_time, new.end_time) then
    perform record_event_change(new.id, 'date_time', 'date_time',
      jsonb_build_object('date', old.event_date, 'start', old.start_time, 'end', old.end_time),
      jsonb_build_object('date', new.event_date, 'start', new.start_time, 'end', new.end_time));
  end if;
  if old.guest_count_estimate is distinct from new.guest_count_estimate then
    perform record_event_change(new.id, 'guest_count', 'guest_count',
      jsonb_build_object('count', old.guest_count_estimate),
      jsonb_build_object('count', new.guest_count_estimate));
  end if;
  if (old.contact_email, old.contact_email_2, old.contact_phone)
     is distinct from (new.contact_email, new.contact_email_2, new.contact_phone) then
    perform record_event_change(new.id, 'contact', 'contact',
      jsonb_build_object('email', old.contact_email, 'email_2', old.contact_email_2, 'phone', old.contact_phone),
      jsonb_build_object('email', new.contact_email, 'email_2', new.contact_email_2, 'phone', new.contact_phone));
  end if;
  if (old.total_price, old.deposit_paid) is distinct from (new.total_price, new.deposit_paid) then
    perform record_event_change(new.id, 'finance', 'finance',
      jsonb_build_object('total', old.total_price, 'deposit', old.deposit_paid),
      jsonb_build_object('total', new.total_price, 'deposit', new.deposit_paid));
  end if;
  return null;
end;
$$;
revoke all on function public.record_event_detail_changes() from public, anon, authenticated;

create trigger events_record_changes
  after update of event_date, start_time, end_time, guest_count_estimate,
    contact_email, contact_email_2, contact_phone, total_price, deposit_paid
  on public.events
  for each row execute function public.record_event_detail_changes();

create function public.record_event_room_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform record_event_change(new.event_id, 'rooms', 'added', null,
      jsonb_build_object('id', new.room_id, 'name', (select name from rooms where id = new.room_id)));
  else
    perform record_event_change(old.event_id, 'rooms', 'removed',
      jsonb_build_object('id', old.room_id, 'name', (select name from rooms where id = old.room_id)), null);
  end if;
  return null;
end;
$$;
revoke all on function public.record_event_room_change() from public, anon, authenticated;

create trigger event_rooms_record_changes
  after insert or delete on public.event_rooms
  for each row execute function public.record_event_room_change();

create function public.record_event_menu_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_menu_id uuid := case when tg_op = 'INSERT' then new.menu_template_id else old.menu_template_id end;
  v_menu jsonb;
begin
  select jsonb_build_object('id', m.id, 'name', m.name, 'custom', m.event_id is not null)
  into v_menu
  from menu_templates m
  where m.id = v_menu_id;
  -- The template itself is being deleted (cascade): keep at least its id.
  v_menu := coalesce(v_menu, jsonb_build_object('id', v_menu_id, 'name', null, 'custom', null));
  if tg_op = 'INSERT' then
    perform record_event_change(new.event_id, 'menus', 'added', null, v_menu);
  else
    perform record_event_change(old.event_id, 'menus', 'removed', v_menu, null);
  end if;
  return null;
end;
$$;
revoke all on function public.record_event_menu_change() from public, anon, authenticated;

create trigger event_menu_templates_record_changes
  after insert or delete on public.event_menu_templates
  for each row execute function public.record_event_menu_change();

create function public.record_custom_menu_rename()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform record_event_change(new.event_id, 'menus', 'renamed',
    jsonb_build_object('name', old.name), jsonb_build_object('name', new.name));
  return null;
end;
$$;
revoke all on function public.record_custom_menu_rename() from public, anon, authenticated;

create trigger menu_templates_record_custom_rename
  after update of name on public.menu_templates
  for each row
  when (new.event_id is not null and old.name is distinct from new.name)
  execute function public.record_custom_menu_rename();

-- ---------------------------------------------------------------------------
-- Custom menus' dishes (0118 + one change row when an event's own menu's
-- dish set changes). Still SECURITY INVOKER: staff RLS (0119) only lets them
-- touch standard packages, which record nothing; event menus are saved by
-- the service role, which may run the recorder.
-- ---------------------------------------------------------------------------

create or replace function public.replace_menu_template_items(p_template_id uuid, p_item_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_menu_name text;
  v_old uuid[];
  v_new uuid[];
begin
  select event_id, name into v_event_id, v_menu_name from menu_templates where id = p_template_id;
  if v_event_id is not null then
    select coalesce(array_agg(menu_item_id order by menu_item_id), '{}') into v_old
    from menu_template_items where menu_template_id = p_template_id;
  end if;

  delete from menu_template_items where menu_template_id = p_template_id;
  insert into menu_template_items (menu_template_id, menu_item_id)
  select p_template_id, item_id
  from unnest(coalesce(p_item_ids, '{}'::uuid[])) as ids(item_id)
  group by item_id;

  if v_event_id is not null then
    select coalesce(array_agg(menu_item_id order by menu_item_id), '{}') into v_new
    from menu_template_items where menu_template_id = p_template_id;
    if v_old <> v_new then
      perform record_event_change(v_event_id, 'menus', 'dishes',
        jsonb_build_object('menu', v_menu_name, 'dishes',
          (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from menu_items where id = any(v_old))),
        jsonb_build_object('menu', v_menu_name, 'dishes',
          (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from menu_items where id = any(v_new))));
    end if;
  end if;
end;
$$;

revoke all on function public.replace_menu_template_items(uuid, uuid[]) from public, anon;
grant execute on function public.replace_menu_template_items(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Couple-side RPCs: the couple's edits, recorded as the couple's.
-- ---------------------------------------------------------------------------

create function public.couple_set_guest_count(p_event_id uuid, p_count int, p_changed_by text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform set_config('app.change_side', 'couple', true);
  perform set_config('app.change_by', coalesce(p_changed_by, ''), true);
  update events set guest_count_estimate = p_count where id = p_event_id;
  -- Later statements in the same transaction are not the couple's.
  perform set_config('app.change_side', '', true);
  perform set_config('app.change_by', '', true);
end;
$$;
revoke all on function public.couple_set_guest_count(uuid, int, text) from public, anon, authenticated;
grant execute on function public.couple_set_guest_count(uuid, int, text) to service_role;

create function public.couple_set_contact_info(
  p_event_id uuid,
  p_email text,
  p_email_2 text,
  p_phone text,
  p_changed_by text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform set_config('app.change_side', 'couple', true);
  perform set_config('app.change_by', coalesce(p_changed_by, ''), true);
  update events
  set contact_email = p_email, contact_email_2 = p_email_2, contact_phone = p_phone
  where id = p_event_id;
  perform set_config('app.change_side', '', true);
  perform set_config('app.change_by', '', true);
end;
$$;
revoke all on function public.couple_set_contact_info(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.couple_set_contact_info(uuid, text, text, text, text) to service_role;

create function public.record_couple_first_login(p_event_id uuid)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  update events set couple_first_login_at = coalesce(couple_first_login_at, now()) where id = p_event_id;
$$;
revoke all on function public.record_couple_first_login(uuid) from public, anon, authenticated;
grant execute on function public.record_couple_first_login(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Venue marks: which sections of which upcoming events have a couple change
-- (or unseen couple/auto menu numbers) the venue hasn't seen. No values.
-- ---------------------------------------------------------------------------

create function public.venue_unseen_change_sections(p_venue_id uuid)
returns table (event_id uuid, section text)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.role() is distinct from 'service_role' and not is_venue_staff_for(p_venue_id) then
    raise exception 'Not authorized for this venue.' using errcode = '42501';
  end if;

  return query
  with upcoming as (
    select e.id
    from events e
    where e.venue_id = p_venue_id
      and e.event_date >= (now() at time zone 'Europe/Skopje')::date
  )
  select c.event_id, c.section
  from event_changes c
  join upcoming u on u.id = c.event_id
  left join event_change_seen s on s.event_id = c.event_id and s.viewer = 'venue' and s.section = c.section
  where c.side = 'couple'
  group by c.event_id, c.section, s.seen_up_to
  having max(c.changed_at) > coalesce(s.seen_up_to, 'epoch'::timestamptz)
  union all
  select u.id, 'menu_numbers'::text
  from upcoming u
  cross join lateral (
    select m.seen_at, m.source
    from event_menu_submissions m
    where m.event_id = u.id
    order by m.sent_at desc, m.id desc
    limit 1
  ) latest
  where latest.seen_at is null and latest.source <> 'venue';
end;
$$;
revoke all on function public.venue_unseen_change_sections(uuid) from public, anon;
grant execute on function public.venue_unseen_change_sections(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Erasure (0122) records no changes, and clears what the change marks hold
-- that is personal: contact values, and the names of who changed, saw or
-- reminded. Otherwise identical.
-- ---------------------------------------------------------------------------

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
  -- sent to the venue stay (counts only); only the name of the manager who
  -- marked them seen is cleared.
  update event_menu_submissions set seen_by = null where event_id = p_event_id and seen_by is not null;

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

  insert into audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, request_id, details)
  values (
    case when p_actor_id is null then 'system' else 'staff' end,
    p_actor_id, 'event_personal_data_erased', v_venue_id, p_event_id, p_event_id, p_request_id,
    jsonb_build_object('reason', p_reason)
  );
  return true;
end;
$$;

commit;
