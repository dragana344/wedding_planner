-- 0031: explicit privileges, hardened SECURITY DEFINER functions, and
-- storage policies that neither leak listings nor allow cross-venue moves.
--
-- Supabase Cloud and the local CLI start from different default privileges
-- (Cloud grants ALL on every new public table to anon and authenticated), so
-- everything here is stated explicitly: after this migration both
-- environments hold the same grants and `supabase db diff` stays empty.
--
--   SEC-023  anon holds no privileges on any public table or sequence.
--            authenticated keeps exactly the DML it has today on the venue
--            tables (RLS still decides which rows), and nothing on the
--            service-role-only couple/guest tables.
--   SEC-006  every SECURITY DEFINER function pins its search_path and is
--            executable only by the roles that call it.
--   SEC-019  the menu-photo update policy also checks the destination folder.
--   SEC-020  anonymous LIST on the public buckets is gone; public object URLs
--            (/storage/v1/object/public/...) do not go through RLS and keep
--            working.

-- ---------------------------------------------------------------------------
-- Tables and sequences
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select, insert, update, delete on
  venues,
  rooms,
  table_types,
  menu_templates,
  menu_items,
  menu_template_items,
  events,
  event_rooms,
  event_showcase_photos,
  room_fixed_elements,
  room_layout_elements,
  event_layout_elements,
  reservations,
  reservation_tables
to authenticated;

grant select on venue_staff, event_custom_menu_items to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- New tables and sequences start closed to API roles; each migration grants
-- what it needs (see docs/production/MIGRATIONS.md).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

alter function public.is_venue_staff_for(uuid) set search_path = public, extensions, pg_temp;
alter function public.create_event_credentials(uuid, text, text) set search_path = public, extensions, pg_temp;
alter function public.regenerate_event_password(uuid, text) set search_path = public, extensions, pg_temp;
alter function public.get_event_username(uuid) set search_path = public, extensions, pg_temp;
alter function public.verify_event_credentials(text, text) set search_path = public, extensions, pg_temp;
alter function public.set_venue_layout_password(uuid, text) set search_path = public, extensions, pg_temp;
alter function public.verify_venue_layout_password(uuid, text) set search_path = public, extensions, pg_temp;

revoke all on all functions in schema public from public, anon, authenticated;

-- Used inside RLS policies evaluated as the signed-in staff user.
grant execute on function public.is_venue_staff_for(uuid) to authenticated, service_role;

-- Staff-facing credential and layout-lock functions; each checks
-- is_venue_staff_for (or service_role) itself.
grant execute on function public.create_event_credentials(uuid, text, text) to authenticated, service_role;
grant execute on function public.regenerate_event_password(uuid, text) to authenticated, service_role;
grant execute on function public.get_event_username(uuid) to authenticated, service_role;
grant execute on function public.set_venue_layout_password(uuid, text) to authenticated, service_role;
grant execute on function public.verify_venue_layout_password(uuid, text) to authenticated, service_role;

-- The couple credential check itself: server-side only.
grant execute on function public.verify_event_credentials(text, text) to service_role;

alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;
-- The built-in "PUBLIC may execute new functions" default is global, and a
-- per-schema entry can only add privileges, never remove a global one.
alter default privileges for role postgres revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- SEC-020: these "public read" policies granted LIST to anyone with the anon
-- key. Staff keep read access to their own venue's folder (the uploader needs
-- it for upsert and delete); invitation photos are written and read by the
-- server with the service role, so no API role needs a policy there.
drop policy if exists "public read menu item photos" on storage.objects;
drop policy if exists "public read event showcase photos" on storage.objects;
drop policy if exists "public read invitation photos" on storage.objects;

create policy "venue staff read own menu item photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'menu-item-photos' and public.is_venue_staff_for((storage.foldername(name))[1]::uuid));

create policy "venue staff read own event showcase photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'event-showcase-photos' and public.is_venue_staff_for((storage.foldername(name))[1]::uuid));

-- SEC-019: the old update policy checked only the row before the update, so
-- an object could be renamed into another venue's folder.
drop policy if exists "venue staff update own menu item photos" on storage.objects;

create policy "venue staff update own menu item photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-item-photos' and public.is_venue_staff_for((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'menu-item-photos' and public.is_venue_staff_for((storage.foldername(name))[1]::uuid));
