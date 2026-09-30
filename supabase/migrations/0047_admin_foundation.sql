-- 0047: platform admin foundation (admin dashboard spec §3.2-3.4).

begin;

alter table public.audit_log drop constraint audit_log_actor_type_check;
alter table public.audit_log add constraint audit_log_actor_type_check
  check (actor_type in ('staff', 'couple', 'guest', 'system', 'admin'));

-- An admin is never venue staff (spec §3.2).
create or replace function public.venue_staff_not_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if exists (select 1 from auth.users where id = new.user_id and raw_app_meta_data->>'role' = 'platform_admin') then
    raise exception 'A platform admin cannot be venue staff.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.venue_staff_not_platform_admin() from public, anon, authenticated;
create trigger venue_staff_not_platform_admin
  before insert or update of user_id on public.venue_staff
  for each row execute function public.venue_staff_not_platform_admin();

-- Supabase's admin API cannot end another user's sessions by id; this can.
-- auth.sessions deletion cascades to auth.refresh_tokens via session_id
-- (verified: refresh_tokens_session_id_fkey ... ON DELETE CASCADE), so a
-- refresh with a token from a deleted session is rejected by GoTrue.
create or replace function public.admin_sign_out_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;
revoke all on function public.admin_sign_out_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_sign_out_user(uuid) to service_role;

create or replace function public.admin_unlock_couple_login(p_event_id uuid)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  update public.event_credentials set failed_attempts = 0, locked_until = null where event_id = p_event_id;
$$;
revoke all on function public.admin_unlock_couple_login(uuid) from public, anon, authenticated;
grant execute on function public.admin_unlock_couple_login(uuid) to service_role;

commit;
