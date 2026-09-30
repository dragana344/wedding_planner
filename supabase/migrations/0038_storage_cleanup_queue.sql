-- 0038 (DATA-011): files follow their rows. When a row that points at a
-- stored photo is deleted (directly or by cascade, e.g. deleting an event or
-- a venue) or its photo is replaced, the old object's path is queued here.
-- Supabase forbids deleting storage.objects from SQL, so the queue is drained
-- through the Storage API by /api/cron/storage-cleanup (lib/storage-cleanup.ts).

create table public.storage_cleanup_queue (
  id bigint generated always as identity primary key,
  bucket text not null,
  path text not null,
  queued_at timestamptz not null default now()
);

alter table public.storage_cleanup_queue enable row level security;
revoke all on public.storage_cleanup_queue from anon, authenticated;
grant all on public.storage_cleanup_queue to service_role;

-- Security definer: staff delete their rows from the browser as
-- `authenticated`, which has no access to the queue itself.
create or replace function public.queue_photo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.photo_path is not null then
      insert into public.storage_cleanup_queue (bucket, path) values (tg_argv[0], old.photo_path);
    end if;
    return old;
  end if;
  if old.photo_path is not null and old.photo_path is distinct from new.photo_path then
    insert into public.storage_cleanup_queue (bucket, path) values (tg_argv[0], old.photo_path);
  end if;
  return new;
end;
$$;

revoke all on function public.queue_photo_cleanup() from public, anon, authenticated;

create trigger event_showcase_photos_queue_cleanup
  after delete or update of photo_path on public.event_showcase_photos
  for each row execute function public.queue_photo_cleanup('event-showcase-photos');

create trigger event_invitations_queue_cleanup
  after delete or update of photo_path on public.event_invitations
  for each row execute function public.queue_photo_cleanup('invitation-photos');

create trigger menu_items_queue_cleanup
  after delete or update of photo_path on public.menu_items
  for each row execute function public.queue_photo_cleanup('menu-item-photos');
