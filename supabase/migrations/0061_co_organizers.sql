-- Session 2 (A12): a co-organizer login per side of the family. The bride's
-- side and the groom's side each get their own username/password for the
-- couple's panel; sessions remember which co-organizer signed in.
--
-- Same shape as event_credentials (0013/0034/0045): bcrypt (cost 10), 10+ char
-- passwords, 5-strike lockout, service-role only (no RLS policies).

create table public.event_co_organizers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  side text not null check (side in ('bride', 'groom')),
  username text not null unique check (char_length(username) between 1 and 200),
  password_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  constraint event_co_organizers_one_per_side unique (event_id, side)
);

alter table public.event_co_organizers enable row level security;
revoke all on public.event_co_organizers from anon, authenticated;
grant all on public.event_co_organizers to service_role;

-- Who a couple session belongs to: null = the couple's own login. Removing a
-- co-organizer ends their sessions.
alter table public.couple_sessions
  add column organizer_id uuid references public.event_co_organizers(id) on delete cascade;
create index couple_sessions_organizer_id_idx on public.couple_sessions(organizer_id);

-- One username space for both logins, so a username names exactly one login.
create or replace function public.couple_username_taken(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (select 1 from event_credentials where username = p_username)
      or exists (select 1 from event_co_organizers where username = p_username);
$$;
revoke all on function public.couple_username_taken(text) from public, anon, authenticated;

create or replace function public.create_co_organizer(p_event_id uuid, p_side text, p_username text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from events where id = p_event_id and is_venue_staff_for(venue_id)
  ) then
    raise exception 'Not authorized to set credentials for this event.';
  end if;
  if char_length(coalesce(p_password, '')) < 10 then
    raise exception 'Лозинката мора да има најмалку 10 знаци.' using errcode = '22023';
  end if;
  if couple_username_taken(p_username) then
    raise exception 'Корисничкото име е зафатено.' using errcode = '23505';
  end if;
  insert into event_co_organizers (event_id, side, username, password_hash)
  values (p_event_id, p_side, p_username, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_co_organizer(uuid, text, text, text) from public, anon;
grant execute on function public.create_co_organizer(uuid, text, text, text) to authenticated, service_role;

-- The couple's own login must not reuse a co-organizer's username either.
-- Body otherwise as in 0045 (bcrypt cost 10).
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
  if exists (select 1 from event_co_organizers where username = p_username) then
    raise exception 'Корисничкото име е зафатено.' using errcode = '23505';
  end if;
  insert into event_credentials (event_id, username, password_hash)
  values (p_event_id, p_username, extensions.crypt(p_password, extensions.gen_salt('bf', 10)));
end;
$$;

-- One login check for both: the couple (organizer_id null) or a co-organizer.
-- Timing and lockout as verify_event_credentials (0045).
create or replace function public.verify_couple_login(p_username text, p_password text)
returns table(event_id uuid, organizer_id uuid, side text, error_code text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  co event_co_organizers%rowtype;
begin
  if exists (select 1 from event_credentials c where c.username = p_username) then
    return query select v.event_id, null::uuid, null::text, v.error_code from verify_event_credentials(p_username, p_password) v;
    return;
  end if;

  select * into co from event_co_organizers c where c.username = p_username;
  if not found then
    perform extensions.crypt(p_password, '$2a$10$amopzlEf9bwgwGGHg6UB4.q/rWaHJe5KyNsVOImbMPY31VjPUGeW6');
    return query select null::uuid, null::uuid, null::text, 'invalid'::text;
    return;
  end if;

  if co.locked_until is not null and co.locked_until > now() then
    return query select null::uuid, null::uuid, null::text, 'locked'::text;
    return;
  end if;

  if co.password_hash = extensions.crypt(p_password, co.password_hash) then
    update event_co_organizers set failed_attempts = 0, locked_until = null where id = co.id;
    return query select co.event_id, co.id, co.side, null::text;
  else
    update event_co_organizers
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
      where id = co.id;
    return query select null::uuid, null::uuid, null::text, 'invalid'::text;
  end if;
end;
$$;
revoke all on function public.verify_couple_login(text, text) from public, anon, authenticated;
grant execute on function public.verify_couple_login(text, text) to service_role;

-- A new password for a co-organizer ends their sessions (as SEC-009 for the couple).
create or replace function public.reset_co_organizer_password(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if char_length(coalesce(p_password, '')) < 10 then
    raise exception 'Лозинката мора да има најмалку 10 знаци.' using errcode = '22023';
  end if;
  update event_co_organizers
    set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), failed_attempts = 0, locked_until = null
    where id = p_id;
  delete from couple_sessions where organizer_id = p_id;
end;
$$;
revoke all on function public.reset_co_organizer_password(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_co_organizer_password(uuid, text) to service_role;

-- Event erasure (0043) keeps the event row and stamps personal_data_erased_at;
-- co-organizer logins go with the rest of the couple's personal data.
create or replace function public.erase_co_organizers_with_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  delete from event_co_organizers where event_id = new.id;
  return new;
end;
$$;
revoke all on function public.erase_co_organizers_with_event() from public, anon, authenticated;

create trigger events_erase_co_organizers
  after update of personal_data_erased_at on public.events
  for each row
  when (old.personal_data_erased_at is null and new.personal_data_erased_at is not null)
  execute function public.erase_co_organizers_with_event();
