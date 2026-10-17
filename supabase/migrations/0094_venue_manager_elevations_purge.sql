-- 0093: venue_manager_elevations needs the same cleanup couple_sessions
-- already gets (0032/0039) — the privacy guard describes it as "short-lived
-- session secrets only, like couple_sessions" (tests/supabase/
-- privacy_guard.test.ts), but nothing purged expired rows or indexed
-- expires_at until now (final review finding I-3). Validation already
-- checks expiry (lib/venue/manager-elevation.ts), so this is cleanup and
-- query performance, not a security fix.

begin;

create index if not exists venue_manager_elevations_expires_at_idx on public.venue_manager_elevations (expires_at);

select cron.schedule(
  'purge-expired-venue-manager-elevations',
  '23 3 * * *',
  $$delete from public.venue_manager_elevations where expires_at < now() - interval '1 day'$$
);

commit;
