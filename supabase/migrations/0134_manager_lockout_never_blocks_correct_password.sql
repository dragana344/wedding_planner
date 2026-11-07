-- 0134: login review finding (2026-10-15), residual gap under the shared-
-- login model. Every venue's staff share one login just to open the
-- dashboard; on top of that, each person elevates to a specific manager
-- with that manager's own name + password. The lockout (0093/0108/0110)
-- is keyed only by venue+name, with no notion of who is attempting it — so
-- anyone already holding the shared login could type a real manager's name,
-- guess wrong 5 times on purpose, and lock that manager out of their own
-- correct password for 15 minutes, repeatable indefinitely. Not the old
-- "forever lockout" bug (already fixed), but a standing way to deny one
-- specific manager access at will.
--
-- Fix: a correct password always succeeds, lock or no lock. The lock exists
-- to slow down WRONG guesses (brute force) — it never needed to block
-- someone who already has the real password, and blocking them is exactly
-- what made this a denial-of-service tool. Wrong-guess throttling is
-- unchanged: 5 wrong attempts within a window still locks out further
-- wrong guesses for 15 minutes, same as before.

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

  if mgr.password_hash = extensions.crypt(p_password, mgr.password_hash) then
    update venue_managers set failed_attempts = 0, locked_until = null where id = mgr.id;
    return query select mgr.id, mgr.name, mgr.is_owner, null::text;
    return;
  end if;

  if mgr.locked_until is not null and mgr.locked_until > now() then
    return query select null::uuid, null::text, null::boolean, 'locked'::text;
    return;
  end if;

  -- A lock that has already expired starts a clean slate: this is attempt
  -- #1 of a new window, not a continuation of the one that just ended.
  v_failed_attempts := case when mgr.locked_until is not null and mgr.locked_until <= now() then 0 else mgr.failed_attempts end;

  update venue_managers
    set failed_attempts = v_failed_attempts + 1,
        locked_until = case when v_failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where id = mgr.id;
  return query select null::uuid, null::text, null::boolean, 'invalid'::text;
end;
$$;

commit;
