create table event_showcase_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  photo_path text not null,
  created_at timestamptz not null default now()
);

create index event_showcase_photos_event_id_idx on event_showcase_photos(event_id);

alter table event_showcase_photos enable row level security;

create policy "venue staff manage own event showcase photos" on event_showcase_photos
  for all using (
    exists (
      select 1 from events
      where events.id = event_showcase_photos.event_id
        and is_venue_staff_for(events.venue_id)
    )
  ) with check (
    exists (
      select 1 from events
      where events.id = event_showcase_photos.event_id
        and is_venue_staff_for(events.venue_id)
    )
  );

grant usage on schema public to anon, authenticated, service_role;
grant all on event_showcase_photos to anon, authenticated, service_role;

insert into storage.buckets (id, name, public)
values ('event-showcase-photos', 'event-showcase-photos', true)
on conflict (id) do nothing;

create policy "public read event showcase photos" on storage.objects
  for select using (bucket_id = 'event-showcase-photos');

create policy "venue staff upload own event showcase photos" on storage.objects
  for insert with check (
    bucket_id = 'event-showcase-photos'
    and is_venue_staff_for((storage.foldername(name))[1]::uuid)
  );

create policy "venue staff delete own event showcase photos" on storage.objects
  for delete using (
    bucket_id = 'event-showcase-photos'
    and is_venue_staff_for((storage.foldername(name))[1]::uuid)
  );
