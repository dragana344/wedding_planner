-- 0087: venue branding — the venue's own logo and accent colour on what its
-- couples and guests see (landing-page promise "Брендирање по мерка на
-- локалот").
--
-- * venues.brand_color: one accent colour, "#rrggbb" lowercase. The logo is
--   already there (venues.logo_path, 0074).
-- * a new venue-scope feature switch `venue_branding`, so the admin decides
--   per plan (or per venue, with an override) who gets it. Without it the
--   logo still prints on the seating plan as before; nothing is taken away.
--
-- The feature catalogue lives in three places in the database, all extended
-- here: the feature_key check on plan_features and on
-- venue_feature_overrides (event_feature_overrides is event-scope only and
-- stays as it is), and the key list inside effective_features(), whose body
-- below is 0048's unchanged except for that list.

begin;

alter table public.venues add column brand_color text
  check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$');

-- The checks were created inline in 0048, so they carry generated names:
-- find each by what it constrains instead of assuming the name.
do $$
declare
  t text;
  c text;
begin
  foreach t in array array['plan_features', 'venue_feature_overrides'] loop
    for c in
      select conname from pg_constraint
      where conrelid = ('public.' || t)::regclass and contype = 'c'
        and pg_get_constraintdef(oid) like '%feature_key%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c);
    end loop;
  end loop;
end $$;

alter table public.plan_features add constraint plan_features_feature_key_check check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu','budget',
    'checklist','agenda','locations','notes','max_guests','reservations',
    'floor_plan','showcase_photos','max_rooms','max_active_events','reports','photo_album',
    'guest_greetings','video_greetings','reminders','personal_invite_links','print_qr','storage_gb',
    'photo_retention_days','co_organizers','venue_branding'));
alter table public.venue_feature_overrides add constraint venue_feature_overrides_feature_key_check check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu','budget',
    'checklist','agenda','locations','notes','max_guests','reservations',
    'floor_plan','showcase_photos','max_rooms','max_active_events','reports','photo_album',
    'guest_greetings','video_greetings','reminders','personal_invite_links','print_qr','storage_gb',
    'photo_retention_days','co_organizers','venue_branding'));

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
                  'storage_gb','photo_retention_days','co_organizers',
                  'venue_branding'])
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

-- Every existing plan gets a row, so the admin's feature editor shows the
-- switch. On for the open default plan and the two top packages, off
-- elsewhere (the free trial included); the admin changes it from there.
insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, 'venue_branding', p.name in ('Стандарден', 'PREMIUM+', 'ULTRA'), null
from public.plans p
on conflict (plan_id, feature_key) do nothing;

commit;
