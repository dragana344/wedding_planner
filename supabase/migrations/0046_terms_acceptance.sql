-- 0046 (COMP-001 / COMP-005, legal review R1-06): record which version of the
-- Terms of Service (which include the Data Processing Agreement) the venue
-- accepted at signup, and when. Written once by the server after
-- provision_venue (lib/venue/provisioning.ts recordTermsAcceptance); the
-- accepting user is the venue's staff member who signed up (venue_staff).
-- A later acceptance of a new version overwrites both columns.

alter table public.venues
  add column terms_version text check (terms_version is null or char_length(terms_version) between 1 and 20),
  add column terms_accepted_at timestamptz,
  add constraint venues_terms_acceptance_complete check ((terms_version is null) = (terms_accepted_at is null));

-- Staff can read their venue (existing select policy) and update it, but must
-- not be able to write the acceptance record from the browser: only server
-- code (service role) sets it. `authenticated` has a table-level UPDATE grant
-- (0031), so a column revoke would not work; a trigger guards the columns.
create or replace function public.venues_guard_terms_acceptance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    (tg_op = 'INSERT' and (new.terms_version is not null or new.terms_accepted_at is not null))
    or (tg_op = 'UPDATE' and (new.terms_version is distinct from old.terms_version
                              or new.terms_accepted_at is distinct from old.terms_accepted_at))
  ) then
    raise exception 'terms acceptance is recorded by the server only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.venues_guard_terms_acceptance() from public, anon, authenticated;

create trigger venues_guard_terms_acceptance
  before insert or update on public.venues
  for each row execute function public.venues_guard_terms_acceptance();
