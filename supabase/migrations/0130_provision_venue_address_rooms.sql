-- 0130: /signup can now also collect the venue's address and the names of
-- its first room(s)/terrace(s), so a new venue isn't dropped into an empty
-- Settings page right after signing up. Both are optional — a venue can
-- still skip them and add everything later, same as today.
--
-- Extends provision_venue (0097) rather than a follow-up client call: the
-- deferred "confirm your email first" signup path (lib/venue/pending-signup.ts)
-- only gets one chance to finish provisioning on first login, so creating the
-- address and rooms outside this one transaction would mean duplicating that
-- logic for both the immediate and deferred paths instead of once here.

begin;

create or replace function public.provision_venue(
  p_user_id uuid,
  p_venue_name text,
  p_owner_name text,
  p_owner_password text,
  p_address text,
  p_room_names text[]
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
  insert into venues (name, address, plan_id) values (p_venue_name, nullif(btrim(coalesce(p_address, '')), ''), (select id from plans where is_default)) returning id into v_venue_id;
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
revoke all on function public.provision_venue(uuid, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.provision_venue(uuid, text, text, text, text, text[]) to service_role;

-- The 4-arg signature is retired: every caller goes through this plan's new
-- 6-arg one. Drop it so a stale call site fails loudly instead of silently
-- skipping the address/rooms.
drop function if exists public.provision_venue(uuid, text, text, text);

commit;
