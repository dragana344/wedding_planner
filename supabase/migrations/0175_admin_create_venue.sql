-- 0175: the platform admin opens venues from the admin panel ("Нов локал"),
-- since public signup is closed (0173). The admin also picks the plan and may
-- enter the venue's phone, so provision_venue takes both — still one
-- transaction, so a failure never leaves a venue on the wrong plan.
--
-- Both new parameters default to null (the default plan, no phone), so every
-- existing caller passing the six named arguments (lib/venue/provisioning.ts,
-- e2e/helpers.ts, tests) resolves to this function unchanged.

begin;

create or replace function public.provision_venue(
  p_user_id uuid,
  p_venue_name text,
  p_owner_name text,
  p_owner_password text,
  p_address text,
  p_room_names text[],
  p_phone text default null,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue_id uuid;
  v_room_name text;
begin
  perform pg_advisory_xact_lock(hashtext('provision_venue:' || p_user_id::text));
  select venue_id into v_venue_id from venue_staff where user_id = p_user_id limit 1;
  if v_venue_id is not null then
    return v_venue_id;
  end if;
  insert into venues (name, address, phone, plan_id)
  values (
    p_venue_name,
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    coalesce(p_plan_id, (select id from plans where is_default))
  )
  returning id into v_venue_id;
  insert into venue_staff (user_id, venue_id) values (p_user_id, v_venue_id);
  insert into venue_managers (venue_id, name, password_hash, is_owner)
  values (v_venue_id, p_owner_name, extensions.crypt(p_owner_password, extensions.gen_salt('bf', 10)), true)
  on conflict do nothing; -- the one-owner-per-venue partial unique index; a retry after this insert already ran is a no-op, not an error
  foreach v_room_name in array coalesce(p_room_names, array[]::text[])
  loop
    v_room_name := btrim(v_room_name);
    if v_room_name <> '' then
      insert into rooms (venue_id, name) values (v_venue_id, v_room_name);
    end if;
  end loop;
  return v_venue_id;
end;
$$;
revoke all on function public.provision_venue(uuid, text, text, text, text, text[], text, uuid) from public, anon, authenticated;
grant execute on function public.provision_venue(uuid, text, text, text, text, text[], text, uuid) to service_role;

-- Two candidates for a six-argument call would be ambiguous; retire the old one.
drop function if exists public.provision_venue(uuid, text, text, text, text, text[]);

commit;
