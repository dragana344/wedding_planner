-- 0035 (DATA-012): the database refuses two reservations holding the same
-- table at overlapping times. lib/venue/reservations.ts still runs its own
-- (stricter) check first to show a friendly message; this closes the race
-- where two staff members book the same table at the same moment and both
-- pass that check.
--
-- The span is the reservation's real time range: date + start_time to
-- date + end_time, where an end at or before the start crosses midnight
-- (the convention from 0015) and a missing end means a 3-hour block
-- (DEFAULT_RESERVATION_MINUTES). Local venue time, so timestamp without tz.
-- Like the app's check, cancelled and completed reservations don't hold a
-- table (INACTIVE_STATUSES in lib/venue/reservations.ts).

create extension if not exists btree_gist with schema extensions;

create or replace function public.reservation_span(p_date date, p_start time, p_end time)
returns tsrange
language sql
immutable
set search_path = pg_catalog
as $$
  select tsrange(
    p_date + p_start,
    case
      when p_end is null then p_date + p_start + interval '3 hours'
      when p_end <= p_start then (p_date + 1) + p_end
      else p_date + p_end
    end,
    '[)'
  )
$$;

-- The exclusion constraint must live on the table that has the table id, so
-- reservation_tables carries a copy of its reservation's span and whether it
-- still holds the table, kept in sync by the two triggers below.
alter table public.reservation_tables add column span tsrange;
alter table public.reservation_tables add column active boolean;

update public.reservation_tables rt
set span = public.reservation_span(r.date, r.start_time, r.end_time),
    active = r.status not in ('cancelled', 'completed')
from public.reservations r
where r.id = rt.reservation_id;

alter table public.reservation_tables alter column span set not null;
alter table public.reservation_tables alter column active set not null;

create or replace function public.reservation_tables_set_span()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select public.reservation_span(r.date, r.start_time, r.end_time), r.status not in ('cancelled', 'completed')
  into new.span, new.active
  from public.reservations r
  where r.id = new.reservation_id;
  return new;
end;
$$;

create trigger reservation_tables_set_span
  before insert or update of reservation_id on public.reservation_tables
  for each row execute function public.reservation_tables_set_span();

create or replace function public.reservations_sync_table_spans()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.reservation_tables
  set span = public.reservation_span(new.date, new.start_time, new.end_time),
      active = new.status not in ('cancelled', 'completed')
  where reservation_id = new.id;
  return new;
end;
$$;

create trigger reservations_sync_table_spans
  after update of date, start_time, end_time, status on public.reservations
  for each row execute function public.reservations_sync_table_spans();

alter table public.reservation_tables
  add constraint reservation_tables_no_overlap
  exclude using gist (layout_element_id with =, span with &&) where (active);

-- Trigger and helper functions run as the caller (the trigger body calls
-- reservation_span with the caller's privileges).
revoke all on function public.reservation_span(date, time, time) from public, anon;
revoke all on function public.reservation_tables_set_span() from public, anon;
revoke all on function public.reservations_sync_table_spans() from public, anon;
grant execute on function public.reservation_span(date, time, time) to authenticated, service_role;
grant execute on function public.reservation_tables_set_span() to authenticated, service_role;
grant execute on function public.reservations_sync_table_spans() to authenticated, service_role;
