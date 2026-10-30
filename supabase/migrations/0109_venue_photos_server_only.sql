-- 0109: event showcase photos (Фотографии за промоција) were hidden from
-- plain staff on screen, but added and removed straight from the staff
-- browser session — any staff member could change them from devtools, the
-- same class of hole as 0095 (events) and 0106 (Settings). The venue logo
-- shares their bucket.
--
-- Both now upload through a one-time signed URL handed out by a gated route
-- (manager for showcase photos, owner for the logo) and are confirmed,
-- checked and recorded server-side with the service-role client
-- (lib/venue/photo-upload.ts). Staff keep reading their photos.

begin;

drop policy "venue staff manage own event showcase photos" on event_showcase_photos;
create policy "venue staff reads own event showcase photos" on event_showcase_photos
  for select using (
    exists (select 1 from events where events.id = event_showcase_photos.event_id and is_venue_staff_for(events.venue_id))
  );
revoke insert, update, delete on event_showcase_photos from anon, authenticated;

drop policy "venue staff upload own event showcase photos" on storage.objects;
drop policy "venue staff delete own event showcase photos" on storage.objects;

commit;
