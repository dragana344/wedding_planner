-- 0092: verify_venue_manager's initial read took no row lock, so concurrent
-- calls could all observe "not locked" before any sibling's UPDATE
-- committed, letting more than 5 real password checks through in a burst
-- (final review finding I-1 on the venue-manager-elevation feature).
-- `for update` serializes concurrent readers of the same manager row so a
-- call blocked behind another's in-flight lockout UPDATE sees the fresh,
-- already-locked state once it proceeds.

begin;

create or replace function public.verify_venue_manager(p_venue_id uuid, p_name text, p_password text)
returns table(manager_id uuid, manager_name text, error_code text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  mgr venue_managers%rowtype;
begin
  select * into mgr from venue_managers where venue_id = p_venue_id and name = p_name for update;
  if not found then
    -- Same bcrypt work as a real check, so response time does not reveal
    -- whether the name exists (same trick as verify_event_credentials).
    perform extensions.crypt(p_password, '$2a$10$amopzlEf9bwgwGGHg6UB4.q/rWaHJe5KyNsVOImbMPY31VjPUGeW6');
    return query select null::uuid, null::text, 'invalid'::text;
    return;
  end if;

  if mgr.locked_until is not null and mgr.locked_until > now() then
    return query select null::uuid, null::text, 'locked'::text;
    return;
  end if;

  if mgr.password_hash = extensions.crypt(p_password, mgr.password_hash) then
    update venue_managers set failed_attempts = 0, locked_until = null where id = mgr.id;
    return query select mgr.id, mgr.name, null::text;
  else
    update venue_managers
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
      where id = mgr.id;
    return query select null::uuid, null::text, 'invalid'::text;
  end if;
end;
$$;

commit;
