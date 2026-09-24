-- supabase/migrations/0013_couple_dashboard.sql
--
-- B2C couple dashboard: replaces the per-person "invite organizer" flow
-- (Supabase Auth + event_organizers, migrations 0010-0012) with a single
-- shared username/password per event, set by venue staff. Couples never get
-- a Supabase Auth account — their access is entirely mediated by server-side
-- code checking couple_sessions, never by RLS.

alter table events add column contact_email text;
alter table events add column contact_email_2 text;
alter table events add column contact_phone text;

-- Remove the mechanism this feature replaces. Policies referencing the
-- function must go before the function itself.
drop policy "organizer manage own event layout elements" on event_layout_elements;
drop policy "organizer reads own event" on events;
drop function if exists is_organizer_for_event(uuid);
drop table if exists event_organizers;

create table event_credentials (
  event_id uuid primary key references events(id) on delete cascade,
  username text not null unique,
  password_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table couple_sessions (
  token text primary key,
  event_id uuid not null references events(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index couple_sessions_event_id_idx on couple_sessions(event_id);

create table event_custom_menu_items (
  event_id uuid not null references events(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  primary key (event_id, menu_item_id)
);

alter table event_credentials enable row level security;
alter table couple_sessions enable row level security;
alter table event_custom_menu_items enable row level security;

-- Deliberately no RLS policy is added for event_credentials or
-- couple_sessions: nothing outside the service-role client (used only by
-- server-only Route Handlers) or the security-definer RPCs below should
-- ever read these directly — not even venue staff via the browser client,
-- since a raw SELECT policy would also expose password_hash (RLS is
-- row-level, not column-level). Venue staff read the username only through
-- get_event_username() below.
create policy "venue staff read own event custom menu items" on event_custom_menu_items
  for select using (
    exists (select 1 from events where events.id = event_custom_menu_items.event_id and is_venue_staff_for(events.venue_id))
  );

grant usage on schema public to anon, authenticated, service_role;
grant all on event_credentials, couple_sessions, event_custom_menu_items to service_role;
grant select on event_custom_menu_items to authenticated;

-- auth.role() = 'service_role' lets trusted server-side/service-role callers
-- (e.g. admin scripts, tests) through without an authenticated staff session;
-- is_venue_staff_for(venue_id) still gates ordinary `authenticated` callers,
-- which is the only role this function is granted to below.
create or replace function create_event_credentials(p_event_id uuid, p_username text, p_password text)
returns void
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from events where id = p_event_id and is_venue_staff_for(venue_id)
  ) then
    raise exception 'Not authorized to set credentials for this event.';
  end if;
  insert into event_credentials (event_id, username, password_hash)
  values (p_event_id, p_username, crypt(p_password, gen_salt('bf')));
end;
$$;

create or replace function regenerate_event_password(p_event_id uuid, p_password text)
returns void
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from events where id = p_event_id and is_venue_staff_for(venue_id)
  ) then
    raise exception 'Not authorized to change credentials for this event.';
  end if;
  update event_credentials
    set password_hash = crypt(p_password, gen_salt('bf')), failed_attempts = 0, locked_until = null
    where event_id = p_event_id;
end;
$$;

create or replace function get_event_username(p_event_id uuid)
returns text
language sql
security definer
stable
as $$
  select username from event_credentials
  where event_id = p_event_id
    and exists (select 1 from events where events.id = p_event_id and is_venue_staff_for(events.venue_id));
$$;

-- Called only from the couple login Route Handler via the service-role
-- client — never exposed to anon/authenticated, since it's the credential
-- check itself and must not be callable by an arbitrary browser session.
create or replace function verify_event_credentials(p_username text, p_password text)
returns table(event_id uuid, error_code text)
language plpgsql
security definer
as $$
declare
  cred event_credentials%rowtype;
begin
  select * into cred from event_credentials where username = p_username;
  if not found then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  if cred.locked_until is not null and cred.locked_until > now() then
    return query select null::uuid, 'locked'::text;
    return;
  end if;

  if cred.password_hash = crypt(p_password, cred.password_hash) then
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

grant execute on function create_event_credentials(uuid, text, text) to authenticated;
grant execute on function regenerate_event_password(uuid, text) to authenticated;
grant execute on function get_event_username(uuid) to authenticated;
grant execute on function verify_event_credentials(text, text) to service_role;
