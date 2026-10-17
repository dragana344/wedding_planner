-- 0090: venue managers — a name+password pair per venue (not a separate
-- Supabase Auth account) that elevates the venue's existing single login
-- from "staff" to "manager" for the current browser tab only (spec
-- docs/superpowers/specs/2026-10-14-venue-manager-staff-login-design.md).
-- Same access pattern as every couple/venue-adjacent table since
-- Sub-project 2: RLS enabled with zero anon/authenticated policies,
-- service_role only — authorization is enforced entirely in application
-- code.

begin;

create table venue_managers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  name text not null,
  password_hash text not null,
  is_owner boolean not null default false,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  unique (venue_id, name)
);
create index venue_managers_venue_id_idx on venue_managers(venue_id);
-- Exactly one owner per venue, same pattern as plans_single_default.
create unique index venue_managers_one_owner on venue_managers(venue_id) where is_owner;

alter table venue_managers enable row level security;

create table venue_manager_elevations (
  token text primary key,
  venue_id uuid not null references venues(id) on delete cascade,
  manager_id uuid not null references venue_managers(id) on delete cascade,
  manager_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index venue_manager_elevations_venue_id_idx on venue_manager_elevations(venue_id);

alter table venue_manager_elevations enable row level security;

create or replace function public.verify_venue_manager(p_venue_id uuid, p_name text, p_password text)
returns table(manager_id uuid, manager_name text, error_code text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  mgr venue_managers%rowtype;
begin
  select * into mgr from venue_managers where venue_id = p_venue_id and name = p_name;
  if not found then
    -- Same bcrypt work as a real check, so response time does not reveal
    -- whether the name exists (same trick as verify_event_credentials).
    perform extensions.crypt(p_password, '$2a$10$amopzlEf9bwgwGGHg6UB4.q/rWaHJe5KyNsVOImbMPY31VjPUGeW6');
    return query select null::uuid, null::text, 'invalid'::text;
    return;
  end if;

  if mgr.locked_until is not null and mgr.locked_until > now() then
    return query select null::uuid, null::text, 'locked'::text;
    return;
  end if;

  if mgr.password_hash = extensions.crypt(p_password, mgr.password_hash) then
    update venue_managers set failed_attempts = 0, locked_until = null where id = mgr.id;
    return query select mgr.id, mgr.name, null::text;
  else
    update venue_managers
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
      where id = mgr.id;
    return query select null::uuid, null::text, 'invalid'::text;
  end if;
end;
$$;
revoke all on function public.verify_venue_manager(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verify_venue_manager(uuid, text, text) to service_role;

create or replace function public.create_venue_manager(p_venue_id uuid, p_name text, p_password text, p_is_owner boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'Лозинката мора да има најмалку 8 знаци.' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_name), '')) = 0 then
    raise exception 'Внесете име.' using errcode = '22023';
  end if;
  insert into venue_managers (venue_id, name, password_hash, is_owner)
  values (p_venue_id, p_name, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), p_is_owner)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_venue_manager(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_venue_manager(uuid, text, text, boolean) to service_role;

commit;
