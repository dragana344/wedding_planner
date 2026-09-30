-- 0045: fixes from the pre-launch security review (SEC-025,
-- docs/production/SECURITY-REVIEW.md).
--
--   SR-01  couple login: an unknown username now costs the same bcrypt work as
--          a known one (no timing oracle), and new/regenerated couple
--          passwords use bcrypt cost 10 instead of the default 6. Existing
--          cost-6 hashes keep working and are upgraded on the next reset.
--   SR-02  rows may only reference the same venue's rooms, menus, dishes and
--          table types (enforced for every role, including the service role).

-- ---------------------------------------------------------------------------
-- SR-01
-- ---------------------------------------------------------------------------

create or replace function public.verify_event_credentials(p_username text, p_password text)
returns table(event_id uuid, error_code text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  cred event_credentials%rowtype;
begin
  select * into cred from event_credentials where username = p_username;
  if not found then
    -- Same bcrypt work as a real check, so response time does not reveal
    -- whether the username exists (SEC-022 made the message identical).
    perform extensions.crypt(p_password, '$2a$10$amopzlEf9bwgwGGHg6UB4.q/rWaHJe5KyNsVOImbMPY31VjPUGeW6');
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  if cred.locked_until is not null and cred.locked_until > now() then
    return query select null::uuid, 'locked'::text;
    return;
  end if;

  if cred.password_hash = extensions.crypt(p_password, cred.password_hash) then
    update event_credentials set failed_attempts = 0, locked_until = null
      where event_credentials.event_id = cred.event_id;
    return query select cred.event_id, null::text;
  else
    update event_credentials
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
      where event_credentials.event_id = cred.event_id;
    return query select null::uuid, 'invalid'::text;
  end if;
end;
$$;

create or replace function public.create_event_credentials(p_event_id uuid, p_username text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from events where id = p_event_id and is_venue_staff_for(venue_id)
  ) then
    raise exception 'Not authorized to set credentials for this event.';
  end if;
  if char_length(coalesce(p_password, '')) < 10 then
    raise exception 'Лозинката мора да има најмалку 10 знаци.' using errcode = '22023';
  end if;
  insert into event_credentials (event_id, username, password_hash)
  values (p_event_id, p_username, extensions.crypt(p_password, extensions.gen_salt('bf', 10)));
end;
$$;

create or replace function public.regenerate_event_password(p_event_id uuid, p_password text)
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
  update event_credentials
    set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), failed_attempts = 0, locked_until = null
    where event_id = p_event_id;
  delete from couple_sessions where event_id = p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- SR-02: same-venue references
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
  if tg_table_name = 'events' then
    if new.menu_template_id is not null
       and not exists (select 1 from menu_templates where id = new.menu_template_id and venue_id = new.venue_id) then
      raise exception 'Menu template does not belong to this venue.' using errcode = '23514';
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
  else -- event_custom_menu_items, event_menu_item_quantities
    select venue_id into v_venue from events where id = new.event_id;
    if not exists (select 1 from menu_items where id = new.menu_item_id and venue_id = v_venue) then
      raise exception 'Menu item does not belong to this event''s venue.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.assert_same_venue_references() from public, anon, authenticated;

create trigger events_same_venue
  before insert or update of menu_template_id, venue_id on public.events
  for each row execute function public.assert_same_venue_references();
create trigger event_layout_elements_same_venue
  before insert or update of room_id, table_type_id, event_id on public.event_layout_elements
  for each row execute function public.assert_same_venue_references();
create trigger room_layout_elements_same_room
  before insert or update of table_type_id, room_id on public.room_layout_elements
  for each row execute function public.assert_same_venue_references();
create trigger event_custom_menu_items_same_venue
  before insert or update on public.event_custom_menu_items
  for each row execute function public.assert_same_venue_references();
create trigger event_menu_item_quantities_same_venue
  before insert or update on public.event_menu_item_quantities
  for each row execute function public.assert_same_venue_references();
