-- 0084: the admin's "unlock couple login" also clears the lockout of the
-- event's co-organizer logins (0061 gave them their own 5-strike lockout).
-- Security definer, search_path and grants exactly as 0047.

begin;

create or replace function public.admin_unlock_couple_login(p_event_id uuid)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  update public.event_credentials set failed_attempts = 0, locked_until = null where event_id = p_event_id;
  update public.event_co_organizers set failed_attempts = 0, locked_until = null where event_id = p_event_id;
$$;
revoke all on function public.admin_unlock_couple_login(uuid) from public, anon, authenticated;
grant execute on function public.admin_unlock_couple_login(uuid) to service_role;

commit;
