-- 0048: plans (tiers) and feature entitlements (admin dashboard spec §4).

begin;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 100),
  description text check (description is null or char_length(description) <= 1000),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index plans_single_default on public.plans (is_default) where is_default;

create table public.plan_features (
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
    'budget','checklist','agenda','locations','notes','max_guests',
    'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
    'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
    'storage_gb','photo_retention_days','co_organizers')),
  enabled boolean not null,
  limit_value integer check (limit_value is null or limit_value >= 0),
  primary key (plan_id, feature_key)
);

create table public.venue_feature_overrides (
  venue_id uuid not null references public.venues(id) on delete cascade,
  feature_key text not null check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
    'budget','checklist','agenda','locations','notes','max_guests',
    'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
    'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
    'storage_gb','photo_retention_days','co_organizers')),
  enabled boolean,
  limit_override boolean not null default false,
  limit_value integer check (limit_value is null or limit_value >= 0),
  note text check (note is null or char_length(note) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (venue_id, feature_key)
);

create table public.event_feature_overrides (
  event_id uuid not null references public.events(id) on delete cascade,
  feature_key text not null check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
    'budget','checklist','agenda','locations','notes','max_guests',
    'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
    'storage_gb','photo_retention_days','co_organizers')),
  enabled boolean,
  limit_override boolean not null default false,
  limit_value integer check (limit_value is null or limit_value >= 0),
  note text check (note is null or char_length(note) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (event_id, feature_key)
);

do $$
begin
  alter table public.plans enable row level security;
  alter table public.plan_features enable row level security;
  alter table public.venue_feature_overrides enable row level security;
  alter table public.event_feature_overrides enable row level security;
end $$;
revoke all on public.plans, public.plan_features, public.venue_feature_overrides, public.event_feature_overrides from anon, authenticated;
grant all on public.plans, public.plan_features, public.venue_feature_overrides, public.event_feature_overrides to service_role;

-- Default plan: everything unlocked, no limits (existing behaviour, spec §4.2).
insert into public.plans (name, description, sort_order, is_default)
values ('Стандарден', 'Сите функции отклучени, без лимити.', 0, true);
insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, k, true, case k when 'storage_gb' then 5 when 'photo_retention_days' then 15 else null end
from public.plans p,
     unnest(array['invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
                  'budget','checklist','agenda','locations','notes','max_guests',
                  'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
                  'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
                  'storage_gb','photo_retention_days','co_organizers']) as k
where p.is_default;

-- Every venue needs a plan. The catalogue tables above already exist and the
-- default plan row was just inserted, so a stable lookup function can back a
-- column DEFAULT: dozens of existing tests across the suite create venues
-- with `insert into venues (name)` and never mention plan_id (this predates
-- entitlements and is out of scope to rewrite here), so the column must default
-- to the default plan rather than merely being backfilled once. (A bare
-- scalar subquery is not allowed as a column DEFAULT in Postgres, hence the
-- wrapper function.) service_role bypasses RLS on `plans` the same way it
-- already does for the other service-role-only tables in this migration, so
-- no SECURITY DEFINER is needed here.
create or replace function public.venues_default_plan_id()
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.plans where is_default limit 1;
$$;
revoke all on function public.venues_default_plan_id() from public, anon, authenticated;
grant execute on function public.venues_default_plan_id() to service_role;

alter table public.venues add column plan_id uuid references public.plans(id) on delete restrict
  default public.venues_default_plan_id();
update public.venues set plan_id = public.venues_default_plan_id() where plan_id is null;
alter table public.venues alter column plan_id set not null;
create index venues_plan_id_idx on public.venues (plan_id);

alter table public.venues
  add column blocked_at timestamptz,
  add column blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 1000);

-- Staff never change plan or block state (they keep UPDATE on venues for the name).
-- auth.role() is null for a direct postgres/psql session (this migration's own
-- backfill above, and any future seed script) and 'service_role' for the admin
-- API's service-role client; neither is in ('anon', 'authenticated'), so both
-- pass through untouched. Only a signed-in staff session (role 'authenticated')
-- can trip this guard.
create or replace function public.venues_protect_admin_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() in ('anon', 'authenticated')
     and (new.plan_id is distinct from old.plan_id or new.blocked_at is distinct from old.blocked_at
          or new.blocked_reason is distinct from old.blocked_reason) then
    raise exception 'Only the platform admin can change the plan or block state.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.venues_protect_admin_columns() from public, anon, authenticated;
create trigger venues_protect_admin_columns before update on public.venues
  for each row execute function public.venues_protect_admin_columns();

-- New venues get the default plan. Latest definition: 0041 (atomic RPCs);
-- keeps its signature, language, search_path, and grants (CREATE OR REPLACE
-- keeps the ACL) — only the plan_id assignment on insert is new.
create or replace function public.provision_venue(p_user_id uuid, p_venue_name text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_venue_id uuid;
begin
  -- Serialise concurrent retries for the same user.
  perform pg_advisory_xact_lock(hashtext('provision_venue:' || p_user_id::text));
  select venue_id into v_venue_id from venue_staff where user_id = p_user_id limit 1;
  if v_venue_id is not null then
    return v_venue_id;
  end if;
  insert into venues (name, plan_id) values (p_venue_name, (select id from plans where is_default)) returning id into v_venue_id;
  insert into venue_staff (user_id, venue_id) values (p_user_id, v_venue_id);
  return v_venue_id;
end;
$$;

-- Blocked venues (spec D8): staff see nothing through RLS. Latest definition:
-- 0044 (MFA aal2 for staff); keeps its signature, SECURITY DEFINER, stable,
-- search_path, and grants (CREATE OR REPLACE keeps the ACL) — only the
-- `blocked_at is null` join is new. SECURITY DEFINER already makes this safe
-- from recursion through venues' own RLS (it runs as the function owner, not
-- the caller), and every RLS policy that gates on venue access calls this
-- function rather than querying venues/venue_staff directly.
create or replace function public.is_venue_staff_for(target_venue_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from venue_staff s join venues v on v.id = s.venue_id
    where s.user_id = auth.uid() and s.venue_id = target_venue_id and v.blocked_at is null
  )
  and public.staff_mfa_satisfied();
$$;

-- Resolution (spec §4.3): event override → venue override → plan → locked.
-- Non-service callers must be staff of the venue in question: auth.role() is
-- null for a direct postgres/psql/seed caller (no PostgREST session, so no
-- JWT claim was ever set) and 'service_role' for the service-role client;
-- coalesce(..., 'service_role') treats both the same and skips the staff
-- check for them. Every other caller (anon, authenticated) always carries a
-- role claim from the JWT, so this never widens API access.
--
-- p_event_id must belong to p_venue_id: without this, staff of venue A could
-- pass venue A's own id (so they clear the is_venue_staff_for check) together
-- with an event id that actually belongs to venue C, and read C's event
-- overrides. This check applies to every caller, including service_role: a
-- mismatched pair is always wrong, either an authorization bypass attempt
-- from a non-service caller or a caller bug from a service-role caller
-- (event_has_feature/feature_limit always derive p_venue_id from the event
-- itself, so a correct caller can never trip this) — failing loudly beats
-- silently resolving the wrong event's overrides either way.
create or replace function public.effective_features(p_venue_id uuid, p_event_id uuid default null)
returns table(feature_key text, enabled boolean, limit_value integer)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' and not public.is_venue_staff_for(p_venue_id) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if p_event_id is not null and not exists (select 1 from events where id = p_event_id and venue_id = p_venue_id) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  return query
  with keys(k) as (
    select unnest(array['invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
                        'budget','checklist','agenda','locations','notes','max_guests',
                        'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
                  'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
                  'storage_gb','photo_retention_days','co_organizers'])
  ),
  plan_row as (select plan_id from venues where id = p_venue_id),
  -- Compute the raw (pre-gating) limit and the resolved `enabled` together, so
  -- the final projection can force limit_value to 0 whenever the feature is
  -- disabled — a plan or override row can carry a stale/irrelevant
  -- limit_value alongside enabled = false, and a disabled max_guests must
  -- never read back as unlimited.
  resolved as (
    select
      keys.k as r_key,
      coalesce(eo.enabled, vo.enabled, pf.enabled, false) as r_enabled,
      case
        when eo.limit_override then eo.limit_value
        when vo.limit_override then vo.limit_value
        when pf.plan_id is not null then pf.limit_value
        else 0
      end as r_raw_limit
    from keys
    left join plan_features pf on pf.plan_id = (select plan_id from plan_row) and pf.feature_key = keys.k
    left join venue_feature_overrides vo on vo.venue_id = p_venue_id and vo.feature_key = keys.k
    left join event_feature_overrides eo on p_event_id is not null and eo.event_id = p_event_id and eo.feature_key = keys.k
  )
  -- Columns are aliased r_* above and selected via resolved.* here: the
  -- function's own OUT parameters (feature_key, enabled, limit_value) become
  -- PL/pgSQL variables in scope for the whole function body, and a bare
  -- `enabled` in this final SELECT is ambiguous between that variable and the
  -- CTE column (observed: "column reference \"enabled\" is ambiguous").
  select resolved.r_key, resolved.r_enabled, case when resolved.r_enabled then resolved.r_raw_limit else 0 end
  from resolved;
end;
$$;
revoke all on function public.effective_features(uuid, uuid) from public, anon;
grant execute on function public.effective_features(uuid, uuid) to authenticated, service_role;

create or replace function public.event_has_feature(p_event_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((select f.enabled from public.effective_features((select venue_id from events where id = p_event_id), p_event_id) f where f.feature_key = p_key), false);
$$;

create or replace function public.venue_has_feature(p_venue_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((select f.enabled from public.effective_features(p_venue_id, null) f where f.feature_key = p_key), false);
$$;

create or replace function public.feature_limit(p_venue_id uuid, p_event_id uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select f.limit_value from public.effective_features(p_venue_id, p_event_id) f where f.feature_key = p_key;
$$;

revoke all on function public.event_has_feature(uuid, text) from public, anon, authenticated;
revoke all on function public.venue_has_feature(uuid, text) from public, anon, authenticated;
revoke all on function public.feature_limit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.event_has_feature(uuid, text) to service_role;
grant execute on function public.venue_has_feature(uuid, text) to service_role;
grant execute on function public.feature_limit(uuid, uuid, text) to service_role;

commit;
