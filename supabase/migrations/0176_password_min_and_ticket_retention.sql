-- 0176 (group A, task 6): one minimum password length, and a retention
-- period for closed support tickets.
--
-- 1. Manager passwords (create_venue_manager, change_venue_manager_password)
--    allowed 8 characters; every other password (venue sign-in, couple and
--    co-organizer logins) needs 10. Both now need 10 too
--    (SECURITY_FACTS.minPasswordLength, lib/security/password.ts). Existing
--    shorter manager passwords still verify; only new ones are checked.
--
-- 2. purge_expired_event_data() (0170) also deletes support tickets that
--    were closed (status 'done') more than 6 months ago, with their reply
--    threads (support_ticket_messages cascades). A couple's tickets usually
--    go earlier, with the event's erasure (0171). A ticket reopened by a
--    reply has resolved_at cleared, so it is kept. The bodies are 0102's /
--    0101's / 0170's, changed only where marked.

begin;

create or replace function public.create_venue_manager(p_venue_id uuid, p_name text, p_password text, p_is_owner boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  -- changed: 8 → 10
  if char_length(coalesce(p_password, '')) < 10 then
    raise exception 'Лозинката мора да има најмалку 10 знаци.' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_name), '')) = 0 then
    raise exception 'Внесете име.' using errcode = '22023';
  end if;
  insert into venue_managers (venue_id, name, password_hash, is_owner)
  values (p_venue_id, trim(p_name), extensions.crypt(p_password, extensions.gen_salt('bf', 10)), p_is_owner)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.change_venue_manager_password(p_manager_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  -- changed: 8 → 10
  if char_length(coalesce(p_new_password, '')) < 10 then
    raise exception 'Лозинката мора да има најмалку 10 знаци.' using errcode = '22023';
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

create or replace function public.purge_expired_event_data()
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Europe/Skopje')::date;
  v_event_id uuid;
  v_events int := 0;
  v_contacts int := 0;
  v_tickets int := 0;
begin
  for v_event_id in
    select id from events
    where personal_data_erased_at is null
      and coalesce(couple_access_extended_until, couple_access_until, (event_date + interval '6 months')::date) < v_today
    order by event_date
  loop
    perform erase_event_personal_data(v_event_id, null, 'retention');
    v_events := v_events + 1;
  end loop;

  delete from contact_submissions
  where created_at < now() - interval '6 months';
  get diagnostics v_contacts = row_count;

  if v_contacts > 0 then
    insert into audit_log (actor_type, action, details)
    values ('system', 'contact_submissions_purged', jsonb_build_object('count', v_contacts, 'months', 6));
  end if;

  -- new: closed support tickets
  delete from support_tickets
  where status = 'done' and resolved_at < now() - interval '6 months';
  get diagnostics v_tickets = row_count;

  if v_tickets > 0 then
    insert into audit_log (actor_type, action, details)
    values ('system', 'support_tickets_purged', jsonb_build_object('count', v_tickets, 'months', 6));
  end if;

  return jsonb_build_object('events_erased', v_events, 'contact_submissions_deleted', v_contacts, 'support_tickets_deleted', v_tickets);
end;
$$;
revoke all on function public.purge_expired_event_data() from public, anon, authenticated;
grant execute on function public.purge_expired_event_data() to service_role;

commit;
