-- 0081 (Session 4, review fix): unconfirmed guest photo uploads get their own
-- private bucket capped at 15 MB. A signed upload URL can't limit the size of
-- what is PUT through it, and an abuser never confirms, so the bucket's own
-- limit is the only bound on what a leaked album link can store until the
-- 24 h sweep. Confirmed photos move on to event-media (0080).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media-uploads', 'event-media-uploads', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Erasure also clears the event's unconfirmed photo uploads.
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
  where ((o.bucket_id = 'event-media' and (o.name like new.id::text || '/%' or o.name like 'pending/' || new.id::text || '/%'))
      or (o.bucket_id = 'event-media-uploads' and o.name like 'pending/' || new.id::text || '/%'))
    and not exists (select 1 from public.storage_cleanup_queue q where q.bucket = o.bucket_id and q.path = o.name);
  return new;
end;
$$;
revoke all on function public.erase_event_media() from public, anon, authenticated;
