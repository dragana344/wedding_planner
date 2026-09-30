-- 0032 (SEC-008): couple_sessions.token holds sha256(token) as lowercase hex,
-- never the raw cookie value. Hash existing rows in place so nobody is logged
-- out; the app looks sessions up by the same hash (lib/couple/session-hash.ts).
update public.couple_sessions
set token = encode(extensions.digest(token, 'sha256'), 'hex');

comment on column public.couple_sessions.token is
  'SHA-256 (hex) of the couple_session cookie value. The raw token is never stored.';

-- Expired sessions are useless and only accumulate; purge them nightly.
create extension if not exists pg_cron;

select cron.schedule(
  'purge-expired-couple-sessions',
  '17 3 * * *',
  $$delete from public.couple_sessions where expires_at < now() - interval '1 day'$$
);
