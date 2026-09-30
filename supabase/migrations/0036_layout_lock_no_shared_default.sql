-- 0036 (SEC-010): new venues no longer share the floor-plan lock code '0000'
-- (0012 set it as the column default). A venue starts with no code; staff
-- set their own in Settings, and until then the lock cannot be opened with a
-- guess. Existing venues keep whatever they have; find the ones still on the
-- old default with:
--   select id, name from venues
--   where layout_lock_password_hash = extensions.crypt('0000', layout_lock_password_hash);
alter table public.venues alter column layout_lock_password_hash drop default;
