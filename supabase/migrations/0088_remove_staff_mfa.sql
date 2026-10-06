-- 0088: two-factor sign-in is removed from the product (owner decision,
-- 2026-10-06). 0044 made every venue-side policy depend on
-- staff_mfa_satisfied(), which hid all venue data from a password-only
-- session of anyone with a verified factor. With no screen left to enter a
-- code, such an account would be locked out, so the check now always passes.
-- The function keeps its name, signature and grants because
-- is_venue_staff_for (0048) and the venue_staff policy (0044) call it.

create or replace function public.staff_mfa_satisfied()
returns boolean
language sql
security definer
stable
set search_path = public, extensions, pg_temp
as $$
  select true;
$$;
