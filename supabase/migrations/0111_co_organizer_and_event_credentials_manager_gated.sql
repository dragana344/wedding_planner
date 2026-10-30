-- 0111: create_co_organizer and create_event_credentials (both from 0061)
-- were still directly grantable to any `authenticated` venue-staff session,
-- the same hole 0102 closed for regenerate_event_password. Each function's
-- own check is only `is_venue_staff_for(venue_id)` — any staff login at the
-- venue, not specifically an elevated manager — so a plain staff member
-- could call either straight from the browser via supabase-js and:
--   - create_co_organizer: mint a co-organizer login (their own chosen
--     password) for any event at the venue, gaining the couple's guest
--     list/budget/etc. view;
--   - create_event_credentials: mint a couple login for an event that has
--     none (e.g. one whose credentials were wiped by an erase-personal-data
--     call), again with a password of their own choosing.
--
-- Both functions already special-case service_role (skip their own
-- is_venue_staff_for check), so every legitimate caller — the couple-side
-- co-organizer route (lib/couple/co-organizers.ts, already using a
-- service-role client) and the event-creation route being updated alongside
-- this migration to create credentials server-side too — keeps working
-- unchanged with a service-role client. Only the direct authenticated grant
-- needs to go, same pattern as 0102.

begin;

revoke execute on function public.create_co_organizer(uuid, text, text, text) from authenticated;
revoke execute on function public.create_event_credentials(uuid, text, text) from authenticated;

commit;
