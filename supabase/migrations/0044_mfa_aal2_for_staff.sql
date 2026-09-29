-- 0044 (SEC-016): opt-in TOTP MFA for venue staff.
--
-- staff_mfa_satisfied(): true unless the signed-in user has a verified MFA
-- factor and this session has not passed it (JWT aal <> 'aal2'). Users
-- without a verified factor are unaffected (MFA is opt-in for now).
--
-- is_venue_staff_for() is the gate behind every venue-side RLS policy
-- (venues, rooms, events, menus, reservations, storage folders, audit log)
-- and behind the staff-facing credential RPCs; it now also requires
-- staff_mfa_satisfied(). The venue_staff self-read (0005) does too, so the
-- server-side "who is the current staff member" lookups (panel layout,
-- lib/privacy/staff.ts) find nothing for a password-only session of an MFA
-- user either. A password-only (aal1) session of such a user therefore sees
-- no venue data, even talking to PostgREST directly with the anon key; the
-- proxy additionally sends it to the login page's code step.
--
-- service_role is unaffected: it bypasses RLS, and the RPCs that accept it
-- check the role separately. is_venue_staff_for keeps its signature,
-- SECURITY DEFINER, search_path and grants (CREATE OR REPLACE keeps the ACL).

create or replace function public.staff_mfa_satisfied()
returns boolean
language sql
security definer
stable
set search_path = public, extensions, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    );
$$;

revoke all on function public.staff_mfa_satisfied() from public, anon;
grant execute on function public.staff_mfa_satisfied() to authenticated, service_role;

create or replace function public.is_venue_staff_for(target_venue_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from venue_staff
    where user_id = auth.uid() and venue_id = target_venue_id
  )
  and public.staff_mfa_satisfied();
$$;

drop policy "staff reads own staff row" on public.venue_staff;
create policy "staff reads own staff row" on public.venue_staff
  for select using (user_id = auth.uid() and public.staff_mfa_satisfied());
