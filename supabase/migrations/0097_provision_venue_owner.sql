-- 0096: /signup now collects the owner's name + manager password alongside
-- the venue name (spec §8) — provision_venue creates the venue, the staff
-- row, AND the is_owner=true venue_managers row in one transaction, so a
-- venue is never left without an owner between signup and a later step.

begin;

create or replace function public.provision_venue(p_user_id uuid, p_venue_name text, p_owner_name text, p_owner_password text)
returns uuid
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('provision_venue:' || p_user_id::text));
  select venue_id into v_venue_id from venue_staff where user_id = p_user_id limit 1;
  if v_venue_id is not null then
    return v_venue_id;
  end if;
  insert into venues (name, plan_id) values (p_venue_name, (select id from plans where is_default)) returning id into v_venue_id;
  insert into venue_staff (user_id, venue_id) values (p_user_id, v_venue_id);
  insert into venue_managers (venue_id, name, password_hash, is_owner)
  values (v_venue_id, p_owner_name, extensions.crypt(p_owner_password, extensions.gen_salt('bf', 10)), true)
  on conflict do nothing; -- the one-owner-per-venue partial unique index; a retry after this insert already ran is a no-op, not an error
  return v_venue_id;
end;
$$;
revoke all on function public.provision_venue(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_venue(uuid, text, text, text) to service_role;

-- The 3-arg signature is retired: every caller goes through this plan's new
-- 4-arg one. Drop it so a stale call site fails loudly instead of silently
-- skipping owner creation.
drop function if exists public.provision_venue(uuid, text);

commit;
