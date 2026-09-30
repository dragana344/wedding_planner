-- 0074 (Session 3, task 10): venue profile (B10) — address, phone and a logo
-- for printed plans and (via Session 2) invitations.
--
-- The logo is stored in the existing event-showcase-photos bucket (image
-- type/size limits from 0040) at <venue_id>/logo-<timestamp>.<ext>; the
-- bucket's staff policies already confine writes to the venue's own folder.
-- A replaced or removed logo is queued for deletion (0038 queue), as is the
-- logo of a deleted venue.

alter table public.venues add column address text check (address is null or char_length(address) <= 300);
alter table public.venues add column phone text check (phone is null or char_length(phone) <= 50);
alter table public.venues add column logo_path text
  check (logo_path is null or (char_length(logo_path) <= 500 and logo_path like id::text || '/logo-%'));

create or replace function public.queue_venue_logo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.logo_path is not null then
      insert into public.storage_cleanup_queue (bucket, path) values ('event-showcase-photos', old.logo_path);
    end if;
    return old;
  end if;
  if old.logo_path is not null and old.logo_path is distinct from new.logo_path then
    insert into public.storage_cleanup_queue (bucket, path) values ('event-showcase-photos', old.logo_path);
  end if;
  return new;
end;
$$;

revoke all on function public.queue_venue_logo_cleanup() from public, anon, authenticated;

create trigger venues_queue_logo_cleanup
  after delete or update of logo_path on public.venues
  for each row execute function public.queue_venue_logo_cleanup();
