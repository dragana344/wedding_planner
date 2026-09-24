alter table menu_items add column price numeric(10, 2);
alter table menu_items add column photo_path text;

insert into storage.buckets (id, name, public)
values ('menu-item-photos', 'menu-item-photos', true)
on conflict (id) do nothing;

create policy "public read menu item photos" on storage.objects
  for select using (bucket_id = 'menu-item-photos');

create policy "venue staff upload own menu item photos" on storage.objects
  for insert with check (
    bucket_id = 'menu-item-photos'
    and is_venue_staff_for((storage.foldername(name))[1]::uuid)
  );

create policy "venue staff update own menu item photos" on storage.objects
  for update using (
    bucket_id = 'menu-item-photos'
    and is_venue_staff_for((storage.foldername(name))[1]::uuid)
  );

create policy "venue staff delete own menu item photos" on storage.objects
  for delete using (
    bucket_id = 'menu-item-photos'
    and is_venue_staff_for((storage.foldername(name))[1]::uuid)
  );
