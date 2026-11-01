-- 0128: couples who logged in before change marks shipped (0125) have a null
-- couple_first_login_at, so their side would show no marks until they log in
-- again. Any event with a couple session has seen a login: start counting now.
-- Idempotent: only fills nulls.

update public.events e
set couple_first_login_at = now()
where e.couple_first_login_at is null
  and exists (select 1 from public.couple_sessions s where s.event_id = e.id);
