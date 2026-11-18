-- 0155: a guest's video may be up to 500 MB (was 100 MB; greeting videos and
-- album videos alike). Photos keep their 15 MB cap. The app checks the same
-- number (lib/media/limits.ts MAX_VIDEO_BYTES); these are the database and
-- bucket backstops. The Supabase project's own per-file limit
-- (Dashboard -> Storage -> Settings) must be at least 500 MB too.

update storage.buckets set file_size_limit = 524288000 where id = 'event-media';

alter table public.event_greetings drop constraint event_greetings_video_bytes_check;
alter table public.event_greetings add constraint event_greetings_video_bytes_check
  check (video_bytes > 0 and video_bytes <= 524288000);

alter table public.event_photos drop constraint event_photos_bytes_check;
alter table public.event_photos add constraint event_photos_bytes_check
  check (bytes > 0 and bytes <= case when mime like 'video/%' then 524288000 else 15728640 end);
