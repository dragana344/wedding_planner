-- 0101: two deferred Minor findings from the venue-manager-staff-login
-- Plan 2/3 final reviews.
--
-- 1. create_venue_manager checked trim(p_name) for emptiness but inserted
--    the untrimmed p_name, so "Марко" and "Марко " (trailing space) passed
--    the venue_id+name uniqueness constraint as two different managers with
--    an indistinguishable display name.
--
-- 2. venue_manager_password_resets never got the same expired-row purge
--    venue_manager_elevations already has (0093) — same short-lived-secret
--    shape, same cleanup need.

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
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'Лозинката мора да има најмалку 8 знаци.' using errcode = '22023';
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

create index if not exists venue_manager_password_resets_expires_at_idx on public.venue_manager_password_resets (expires_at);

select cron.schedule(
  'purge-expired-venue-manager-password-resets',
  '27 3 * * *',
  $$delete from public.venue_manager_password_resets where expires_at < now() - interval '1 day'$$
);

commit;
