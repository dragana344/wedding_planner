-- 0151: greetings come back with the invitation; the QR page is for photos
-- and videos.
--
-- * event_greetings.guest_id: a greeting sent from the invitation (personal
--   link, or the shared link right after the guest's RSVP) belongs to that
--   guest. One per guest. The name is copied from the guest list, which may be
--   a single word, so last_name may be empty on these rows.
-- * event_photos also holds the guests' album videos (mp4/webm/mov, up to the
--   same 100 MB as a video greeting); event_media_usage now counts them as
--   video, not photo.
-- * a new event-scope limit `max_video_seconds`: how long a guest's video may
--   be (album and greeting alike). null = no length limit, disabled or 0 = no
--   videos. Every existing plan starts at 30 s, today's greeting limit.
--
-- effective_features() below is 0087's unchanged except for its key list.

begin;

-- Greetings from the invitation --------------------------------------------

alter table public.event_greetings
  add column guest_id uuid references public.event_guests(id) on delete set null;
create unique index event_greetings_guest_idx on public.event_greetings(guest_id);

alter table public.event_greetings drop constraint event_greetings_last_name_check;
alter table public.event_greetings add constraint event_greetings_last_name_check check (
  char_length(btrim(last_name)) <= 60 and (guest_id is not null or char_length(btrim(last_name)) >= 1));

-- Videos in the album ----------------------------------------------------------

alter table public.event_photos drop constraint event_photos_mime_check;
alter table public.event_photos add constraint event_photos_mime_check check (
  mime in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'));
alter table public.event_photos drop constraint event_photos_bytes_check;
alter table public.event_photos add constraint event_photos_bytes_check check (
  bytes > 0 and bytes <= case when mime like 'video/%' then 104857600 else 15728640 end);

create or replace function public.event_media_usage(p_event_id uuid)
returns table (photo_bytes bigint, video_bytes bigint, photo_count int, greeting_count int)
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select
    coalesce((select sum(p.bytes) from event_photos p where p.event_id = p_event_id and p.mime like 'image/%'), 0)::bigint,
    (coalesce((select sum(g.video_bytes) from event_greetings g where g.event_id = p_event_id), 0)
      + coalesce((select sum(p.bytes) from event_photos p where p.event_id = p_event_id and p.mime like 'video/%'), 0))::bigint,
    (select count(*) from event_photos p where p.event_id = p_event_id)::int,
    (select count(*) from event_greetings g where g.event_id = p_event_id)::int;
$$;
revoke all on function public.event_media_usage(uuid) from public, anon, authenticated;
grant execute on function public.event_media_usage(uuid) to service_role;

-- max_video_seconds ------------------------------------------------------------

alter table public.plan_features drop constraint plan_features_feature_key_check;
alter table public.plan_features add constraint plan_features_feature_key_check check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu','budget',
    'checklist','agenda','locations','notes','max_guests','reservations',
    'floor_plan','showcase_photos','max_rooms','max_active_events','reports','photo_album',
    'guest_greetings','video_greetings','reminders','personal_invite_links','print_qr','storage_gb',
    'photo_retention_days','co_organizers','venue_branding','max_video_seconds'));
alter table public.venue_feature_overrides drop constraint venue_feature_overrides_feature_key_check;
alter table public.venue_feature_overrides add constraint venue_feature_overrides_feature_key_check check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu','budget',
    'checklist','agenda','locations','notes','max_guests','reservations',
    'floor_plan','showcase_photos','max_rooms','max_active_events','reports','photo_album',
    'guest_greetings','video_greetings','reminders','personal_invite_links','print_qr','storage_gb',
    'photo_retention_days','co_organizers','venue_branding','max_video_seconds'));
alter table public.event_feature_overrides drop constraint event_feature_overrides_feature_key_check;
alter table public.event_feature_overrides add constraint event_feature_overrides_feature_key_check check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
    'budget','checklist','agenda','locations','notes','max_guests',
    'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
    'storage_gb','photo_retention_days','co_organizers','max_video_seconds'));

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
                  'venue_branding','max_video_seconds'])
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

-- Every existing plan starts at today's 30 s; the admin changes it per package.
insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, 'max_video_seconds', true, 30
from public.plans p
on conflict (plan_id, feature_key) do nothing;

commit;
