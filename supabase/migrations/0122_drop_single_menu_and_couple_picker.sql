-- 0122: remove the single-menu, couple menu-picker and quantities machinery.
--
-- An event's menus live in event_menu_templates (0115), its custom menu is a
-- menu_templates row with event_id set (0119/0121), guests' choices are
-- event_guest_menu_counts and the numbers sent to the venue are
-- event_menu_submissions (0119). What this drops:
--   * events.menu_template_id (the old single menu; 0120 kept it as a bridge);
--   * event_custom_menu_items and event_menu_item_quantities;
--   * set_event_menu_template, set_event_menu_custom, replace_menu_item_quantities;
--   * event_guests.menu_choice (the couple's per-guest standard/posno/vegetarian pick).
-- The database is emptied before launch, so no data is carried over.
--
-- Also:
--   * create_event_full / update_event_full no longer write events.menu_template_id;
--   * assert_same_venue_references() (0045) loses its events and custom-items
--     branches and gains one for event_menu_templates: the template belongs to
--     the event's venue, and an event-only menu can only be linked to its own event;
--   * enforce_entitlements() (body from 0086) moves the custom_menu gate from
--     event_custom_menu_items to menu_templates rows with event_id set. Every
--     other branch is unchanged.

begin;

-- RPCs that wrote the dropped objects (0041).
drop function public.set_event_menu_template(uuid, uuid);
drop function public.set_event_menu_custom(uuid, uuid[]);
drop function public.replace_menu_item_quantities(uuid, jsonb);

-- The events same-venue trigger fires on update of menu_template_id, so it
-- has to go before the column.
drop trigger events_same_venue on public.events;

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
    guest_count_estimate = p_guest_count_estimate
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

-- Erasure (0043) without the two dropped tables, and clearing
-- event_menu_submissions.seen_by (personal, 0119); otherwise identical.
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
  -- Guests' menu counts (0119) cascade with event_guests. The menu numbers
  -- sent to the venue stay (counts only); only the name of the manager who
  -- marked them seen is cleared.
  update event_menu_submissions set seen_by = null where event_id = p_event_id and seen_by is not null;

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

drop table public.event_custom_menu_items;
drop table public.event_menu_item_quantities;

-- 0117's column-level SELECT grant on events loses this column with it.
alter table public.events drop column menu_template_id;

-- 0060; its check constraint goes with it.
alter table public.event_guests drop column menu_choice;

-- ---------------------------------------------------------------------------
-- Same-venue references (0045), now covering event_menu_templates.
-- ---------------------------------------------------------------------------

create or replace function public.assert_same_venue_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue uuid;
begin
  if tg_table_name = 'event_menu_templates' then
    select venue_id into v_venue from events where id = new.event_id;
    if not exists (
      select 1 from menu_templates
      where id = new.menu_template_id
        and venue_id = v_venue
        and (event_id is null or event_id = new.event_id)
    ) then
      raise exception 'Menu template does not belong to this event.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'event_layout_elements' then
    select venue_id into v_venue from events where id = new.event_id;
    if not exists (select 1 from rooms where id = new.room_id and venue_id = v_venue) then
      raise exception 'Room does not belong to this event''s venue.' using errcode = '23514';
    end if;
    if new.table_type_id is not null
       and not exists (select 1 from table_types where id = new.table_type_id and room_id = new.room_id) then
      raise exception 'Table type does not belong to this room.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'room_layout_elements' then
    if new.table_type_id is not null
       and not exists (select 1 from table_types where id = new.table_type_id and room_id = new.room_id) then
      raise exception 'Table type does not belong to this room.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.assert_same_venue_references() from public, anon, authenticated;

create trigger event_menu_templates_same_venue
  before insert or update on public.event_menu_templates
  for each row execute function public.assert_same_venue_references();

-- ---------------------------------------------------------------------------
-- custom_menu entitlement on event-only menus.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue uuid;
  v_limit integer;
  v_count integer;
  v_only_nulled boolean;
  v_basic text[] := basic_invitation_templates();
begin
  -- Erasure (0043's `update event_layout_elements set label = null ...`) and
  -- ON DELETE SET NULL cascades (e.g. deleting a table_types row nulls out
  -- room_layout_elements/event_layout_elements.table_type_id) null out a
  -- column with no intent to touch an entitlement-gated field's *value*.
  -- D7 already requires deletes to never be blocked by a locked plan; the
  -- same principle extends to an update whose only effect is removing
  -- information (every changed column becomes null) — otherwise a locked
  -- plan could leave the privacy retention sweep or a routine FK cascade
  -- permanently stuck. Applies to every UPDATE branch below.
  if tg_op = 'UPDATE' then
    select coalesce(bool_and(n.value = 'null'::jsonb), true)
    into v_only_nulled
    from jsonb_each(to_jsonb(new)) as n(key, value)
    join jsonb_each(to_jsonb(old)) as o(key, value) using (key)
    where n.value is distinct from o.value;
    if v_only_nulled then
      return new;
    end if;
  end if;

  case tg_table_name
  when 'event_guests' then
    select venue_id into v_venue from events where id = new.event_id;
    v_limit := feature_limit(v_venue, new.event_id, 'max_guests');
    if v_limit is not null then
      -- Serialises concurrent inserts for the same event so two requests
      -- racing the same count-then-insert check can't both slip in over
      -- the limit.
      perform pg_advisory_xact_lock(hashtextextended('ent:guests:' || new.event_id, 0));
      select count(*) into v_count from event_guests where event_id = new.event_id;
      if v_count >= v_limit then
        raise exception 'Достигнат е лимитот од % гости за овој настан.', v_limit using errcode = 'P0001';
      end if;
    end if;

  when 'rooms' then
    v_limit := feature_limit(new.venue_id, null, 'max_rooms');
    if v_limit is not null then
      perform pg_advisory_xact_lock(hashtextextended('ent:rooms:' || new.venue_id, 0));
      select count(*) into v_count from rooms where venue_id = new.venue_id;
      if v_count >= v_limit then
        raise exception 'Достигнат е лимитот од % простории.', v_limit using errcode = 'P0001';
      end if;
    end if;

  when 'events' then
    -- OLD.status simply reads as NULL when TG_OP = 'INSERT' (there is no
    -- error referencing an unassigned OLD field access like this; verified
    -- directly against this Postgres build), and `tg_op = 'INSERT'` being
    -- true makes the OR's result TRUE regardless of evaluation order (three-
    -- valued logic: TRUE OR NULL = TRUE), so this is safe as one expression.
    -- 0086: "active" means not completed or cancelled *and* not yet past.
    -- The limit is checked whenever a row becomes active: a new event dated
    -- today or later, a completed/cancelled one reopened, or a past one
    -- moved to today or later. Without the last case, events could be
    -- created with a past date (which no longer counts) and then moved
    -- forward one after another, past the limit.
    if new.status not in ('completed', 'cancelled')
       and new.event_date >= (now() at time zone 'Europe/Skopje')::date
       and (tg_op = 'INSERT'
            or old.status in ('completed', 'cancelled')
            or old.event_date < (now() at time zone 'Europe/Skopje')::date) then
      v_limit := feature_limit(new.venue_id, null, 'max_active_events');
      if v_limit is not null then
        perform pg_advisory_xact_lock(hashtextextended('ent:events:' || new.venue_id, 0));
        -- An event whose day has passed is no longer "active", even when
        -- nobody set its status to completed (0086).
        select count(*) into v_count from events
        where venue_id = new.venue_id and status not in ('completed', 'cancelled') and id <> new.id
          and event_date >= (now() at time zone 'Europe/Skopje')::date;
        if v_count >= v_limit then
          raise exception 'Достигнат е лимитот од % активни настани.', v_limit using errcode = 'P0001';
        end if;
      end if;
    end if;

  when 'reservations' then
    if not venue_has_feature(new.venue_id, 'reservations') then perform entitlement_locked(); end if;

  when 'room_fixed_elements', 'room_layout_elements' then
    select venue_id into v_venue from rooms where id = new.room_id;
    if not venue_has_feature(v_venue, 'floor_plan') then perform entitlement_locked(); end if;

  when 'event_showcase_photos' then
    select venue_id into v_venue from events where id = new.event_id;
    if not venue_has_feature(v_venue, 'showcase_photos') then perform entitlement_locked(); end if;

  when 'event_layout_elements' then
    if not event_has_feature(new.event_id, 'seating') then perform entitlement_locked(); end if;

  when 'menu_templates' then
    -- 0122: a custom menu is a menu_templates row tied to one event
    -- (event_id set); replaces the old per-dish custom-items case.
    -- Venue-wide templates (event_id null) are not gated. Same OLD-on-INSERT
    -- reasoning as the `events` branch above.
    if new.event_id is not null and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id) then
      if not event_has_feature(new.event_id, 'custom_menu') then perform entitlement_locked(); end if;
    end if;

  when 'event_invitations' then
    -- The `invitation` switch itself only gates INSERT and updates that
    -- change what's shown (template_id or message) — same OLD-on-INSERT
    -- reasoning as the `events` branch above applies to every `old.*`
    -- reference below.
    if tg_op = 'INSERT' or new.template_id is distinct from old.template_id or new.message is distinct from old.message then
      if not event_has_feature(new.event_id, 'invitation') then perform entitlement_locked(); end if;
    end if;

    if (tg_op = 'INSERT' or new.template_id is distinct from old.template_id)
       and not (new.template_id = any (v_basic))
       and not event_has_feature(new.event_id, 'invitation_all_templates') then
      perform entitlement_locked();
    end if;

    if new.photo_path is not null and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path)
       and not event_has_feature(new.event_id, 'invitation_photo') then
      perform entitlement_locked();
    end if;

  else
    -- Defensive: this function is only ever attached as a trigger on the
    -- tables listed above, but a CASE with no matching WHEN and no ELSE
    -- raises "case not found", so an unlisted table fails safe instead.
    null;
  end case;

  return new;
end;
$$;

create trigger menu_templates_entitlements
  before insert or update of event_id on public.menu_templates
  for each row execute function public.enforce_entitlements();

commit;
