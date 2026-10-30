-- 0104: the app owner decided manager/owner password recovery goes through
-- a phone call to support (admin dashboard resets it directly, same as the
-- couple-login "new password" action), not a self-service email link —
-- there's only one email address per venue anyway, so the email-based
-- "forgot password" flow (0099) never bought real per-manager isolation.
-- Drops the purge cron (0101) and the table itself; the app code and
-- routes behind it are removed in the same change.

begin;

select cron.unschedule('purge-expired-venue-manager-password-resets');

drop table if exists public.venue_manager_password_resets;

commit;
