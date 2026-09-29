-- 0037 (SEC-002): fixed-window request counters for rate limiting public and
-- credential endpoints. Kept in Postgres (same region as the app, no extra
-- processor). Keys are "<bucket>:<sha256 of client IP or other subject>", so
-- no raw IP address is stored. Server-only: service_role calls rate_limit_hit.

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- Counts one hit against `p_key` in the current fixed window and returns the
-- new count. Atomic under concurrency (single upsert).
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.rate_limits as r (key, window_start, hits)
  values (
    p_key,
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds),
    1
  )
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits
$$;

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;

create index rate_limits_window_start_idx on public.rate_limits (window_start);

select cron.schedule(
  'purge-old-rate-limit-windows',
  '41 * * * *',
  $$delete from public.rate_limits where window_start < now() - interval '1 day'$$
);
