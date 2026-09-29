-- 0034
--   SEC-009  regenerating an event's couple password also ends every couple
--            session for that event, so a leaked cookie dies with the reset.
--   SEC-027  couple passwords must be at least 10 characters. The panel's
--            generator produces 12; hand-typed passwords are checked here,
--            where no client can skip it.
-- Bodies are otherwise unchanged from 0013; search_path as pinned in 0031.
-- CREATE OR REPLACE keeps the existing grants.

create or replace function public.create_event_credentials(p_event_id uuid, p_username text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from events where id = p_event_id and is_venue_staff_for(venue_id)
  ) then
    raise exception 'Not authorized to set credentials for this event.';
  end if;
  if char_length(coalesce(p_password, '')) < 10 then
    raise exception 'Лозинката мора да има најмалку 10 знаци.' using errcode = '22023';
  end if;
  insert into event_credentials (event_id, username, password_hash)
  values (p_event_id, p_username, extensions.crypt(p_password, extensions.gen_salt('bf')));
end;
$$;

create or replace function public.regenerate_event_password(p_event_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from events where id = p_event_id and is_venue_staff_for(venue_id)
  ) then
    raise exception 'Not authorized to change credentials for this event.';
  end if;
  if char_length(coalesce(p_password, '')) < 10 then
    raise exception 'Лозинката мора да има најмалку 10 знаци.' using errcode = '22023';
  end if;
  update event_credentials
    set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')), failed_attempts = 0, locked_until = null
    where event_id = p_event_id;
  delete from couple_sessions where event_id = p_event_id;
end;
$$;
