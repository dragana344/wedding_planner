-- 0101 (Plan 3 final review, Important finding): changing a manager's
-- password — whether self-service or via a forgot-password reset — left
-- every existing elevation token for that manager valid for up to its
-- remaining 4-hour life, and left failed_attempts/locked_until untouched.
-- Someone who elevated with a since-changed (e.g. compromised) password
-- kept manager/owner access regardless of the change. change_venue_manager_
-- password now revokes every elevation for that manager and clears their
-- lockout state in the same transaction as the password update.

begin;

create or replace function public.change_venue_manager_password(p_manager_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if char_length(coalesce(p_new_password, '')) < 8 then
    raise exception 'Лозинката мора да има најмалку 8 знаци.' using errcode = '22023';
  end if;
  update venue_managers
    set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
        failed_attempts = 0,
        locked_until = null
    where id = p_manager_id;
  delete from venue_manager_elevations where manager_id = p_manager_id;
end;
$$;
revoke all on function public.change_venue_manager_password(uuid, text) from public, anon, authenticated;
grant execute on function public.change_venue_manager_password(uuid, text) to service_role;

commit;
