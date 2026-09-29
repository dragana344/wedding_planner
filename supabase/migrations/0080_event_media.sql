-- 0080 (Session 4, C1–C3, C5–C7): guest photos, greetings (with an optional
-- video) and the album's public token. Service role only: guests reach these
-- through /api/e/<token>, couples through /api/couple/album; nobody reads
-- them from the browser. Files live in the private event-media bucket and
-- follow their rows through the 0038 cleanup queue.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 104857600,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- One public token per event for the guests' QR page. A table rather than a
-- column on events, so erasing the event's personal data can drop it.
create table public.event_albums (
  event_id uuid primary key references public.events(id) on delete cascade,
  public_token text not null unique check (char_length(public_token) >= 22),
  retention_notice_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  storage_path text not null unique,
  bytes bigint not null check (bytes > 0 and bytes <= 15728640),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  width int check (width between 1 and 20000),
  height int check (height between 1 and 20000),
  uploader_name text check (char_length(uploader_name) <= 120),
  consent_at timestamptz not null,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index event_photos_event_created_idx on public.event_photos (event_id, created_at desc);

create table public.event_greetings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 60),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  video_path text unique,
  video_bytes bigint check (video_bytes > 0 and video_bytes <= 104857600),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  check ((video_path is null) = (video_bytes is null))
);
create index event_greetings_event_created_idx on public.event_greetings (event_id, created_at desc);

alter table public.event_albums enable row level security;
alter table public.event_photos enable row level security;
alter table public.event_greetings enable row level security;
revoke all on public.event_albums, public.event_photos, public.event_greetings from anon, authenticated;
grant all on public.event_albums, public.event_photos, public.event_greetings to service_role;

-- Files follow their rows: same contract as 0038's queue_photo_cleanup, but
-- these tables name their path column differently.
create or replace function public.queue_event_media_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_old text;
  v_new text;
begin
  if tg_table_name = 'event_photos' then
    v_old := old.storage_path;
    v_new := case when tg_op = 'DELETE' then null else new.storage_path end;
  else
    v_old := old.video_path;
    v_new := case when tg_op = 'DELETE' then null else new.video_path end;
  end if;
  if v_old is not null and v_old is distinct from v_new then
    insert into public.storage_cleanup_queue (bucket, path) values ('event-media', v_old);
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.queue_event_media_cleanup() from public, anon, authenticated;

create trigger event_photos_queue_cleanup
  after delete or update of storage_path on public.event_photos
  for each row execute function public.queue_event_media_cleanup();
create trigger event_greetings_queue_cleanup
  after delete or update of video_path on public.event_greetings
  for each row execute function public.queue_event_media_cleanup();

-- Event erasure (0043) marks the event; its media go with it. A trigger rather
-- than a new erase_event_personal_data(), so sessions extending that function
-- in parallel don't overwrite each other. Uploads never confirmed
-- (pending/<event>/…) are queued too.
create or replace function public.erase_event_media()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  delete from public.event_photos where event_id = new.id;
  delete from public.event_greetings where event_id = new.id;
  delete from public.event_albums where event_id = new.id;
  insert into public.storage_cleanup_queue (bucket, path)
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id = 'event-media'
    and (o.name like new.id::text || '/%' or o.name like 'pending/' || new.id::text || '/%')
    and not exists (select 1 from public.storage_cleanup_queue q where q.bucket = o.bucket_id and q.path = o.name);
  return new;
end;
$$;
revoke all on function public.erase_event_media() from public, anon, authenticated;

create trigger events_erase_media
  after update of personal_data_erased_at on public.events
  for each row
  when (old.personal_data_erased_at is null and new.personal_data_erased_at is not null)
  execute function public.erase_event_media();

-- Storage used by one event's album (C5).
create or replace function public.event_media_usage(p_event_id uuid)
returns table (photo_bytes bigint, video_bytes bigint, photo_count int, greeting_count int)
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select
    coalesce((select sum(p.bytes) from event_photos p where p.event_id = p_event_id), 0)::bigint,
    coalesce((select sum(g.video_bytes) from event_greetings g where g.event_id = p_event_id), 0)::bigint,
    (select count(*) from event_photos p where p.event_id = p_event_id)::int,
    (select count(*) from event_greetings g where g.event_id = p_event_id)::int;
$$;
revoke all on function public.event_media_usage(uuid) from public, anon, authenticated;
grant execute on function public.event_media_usage(uuid) to service_role;
