-- 0110: verify_venue_manager never reset failed_attempts once a lockout
-- expired, so any wrong password after the 15-minute lock passed re-crossed
-- the >=5 threshold immediately (failed_attempts kept climbing: 6, 7, 8...)
-- and re-locked for another 15 minutes. Anyone with the shared staff login
-- could keep the owner locked out indefinitely by typing one bad password
-- every 15 minutes, with no way back in except support (security review
-- finding). An expired lock must start a fresh attempt window instead of
-- extending the old one forever.

begin;

create or replace function public.verify_venue_manager(p_venue_id uuid, p_name text, p_password text)
returns table(manager_id uuid, manager_name text, is_owner boolean, error_code text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  mgr venue_managers%rowtype;
  v_failed_attempts int;
begin
  select * into mgr from venue_managers where venue_id = p_venue_id and name = trim(p_name) for update;
  if not found then
    perform extensions.crypt(p_password, '$2a$10$amopzlEf9bwgwGGHg6UB4.q/rWaHJe5KyNsVOImbMPY31VjPUGeW6');
    return query select null::uuid, null::text, null::boolean, 'invalid'::text;
    return;
  end if;

  if mgr.locked_until is not null and mgr.locked_until > now() then
    return query select null::uuid, null::text, null::boolean, 'locked'::text;
    return;
  end if;

  -- A lock that has already expired starts a clean slate: this is attempt
  -- #1 of a new window, not a continuation of the one that just ended.
  v_failed_attempts := case when mgr.locked_until is not null and mgr.locked_until <= now() then 0 else mgr.failed_attempts end;

  if mgr.password_hash = extensions.crypt(p_password, mgr.password_hash) then
    update venue_managers set failed_attempts = 0, locked_until = null where id = mgr.id;
    return query select mgr.id, mgr.name, mgr.is_owner, null::text;
  else
    update venue_managers
      set failed_attempts = v_failed_attempts + 1,
          locked_until = case when v_failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
      where id = mgr.id;
    return query select null::uuid, null::text, null::boolean, 'invalid'::text;
  end if;
end;
$$;

commit;
