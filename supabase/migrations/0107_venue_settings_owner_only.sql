-- 0106 (security review item #2): Поставки is owner-only (spec D4), but the
-- page gate was the only check — the venue's name, address/phone/logo,
-- brand colour and floor-plan lock password were written straight from the
-- staff browser session, so any staff member could change them from
-- devtools. Same class of hole 0095 closed for events.
--
-- Every one of those writes now runs in /api/venue/settings(/logo) behind
-- the owner-elevation check, with the service-role client. Staff keep
-- reading their venue; nothing else in the app updates `venues` from a
-- staff session (terms acceptance and plan/block state were already
-- server-only, 0046/0048).

begin;

drop policy "venue staff update own venue" on venues;
revoke update on venues from anon, authenticated;

-- The route calls this with the service-role client, where
-- is_venue_staff_for() is false (no auth.uid()); staff lose direct access.
create or replace function public.set_venue_layout_password(p_venue_id uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update venues
  set layout_lock_password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
  where id = p_venue_id and (coalesce(auth.role(), '') = 'service_role' or is_venue_staff_for(p_venue_id));
  return found;
end;
$$;
revoke execute on function public.set_venue_layout_password(uuid, text) from public, anon, authenticated;
grant execute on function public.set_venue_layout_password(uuid, text) to service_role;

commit;
