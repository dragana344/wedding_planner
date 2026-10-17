-- 0107: security review Minor finding — 0101 trimmed the manager name on
-- create (storage side), but verify_venue_manager's lookup still compared
-- the raw, untrimmed p_name. A manager stored as "Марко" (already trimmed
-- since 0101) could not log back in if they typed " Марко" or "Марко " —
-- the exact asymmetry 0101 was meant to close, just on the read side instead
-- of the write side.

begin;

create or replace function public.verify_venue_manager(p_venue_id uuid, p_name text, p_password text)
returns table(manager_id uuid, manager_name text, is_owner boolean, error_code text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  mgr venue_managers%rowtype;
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

  if mgr.password_hash = extensions.crypt(p_password, mgr.password_hash) then
    update venue_managers set failed_attempts = 0, locked_until = null where id = mgr.id;
    return query select mgr.id, mgr.name, mgr.is_owner, null::text;
  else
    update venue_managers
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
      where id = mgr.id;
    return query select null::uuid, null::text, null::boolean, 'invalid'::text;
  end if;
end;
$$;

commit;
