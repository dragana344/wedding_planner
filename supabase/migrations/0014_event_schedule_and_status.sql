-- Adds the scheduling and lifecycle fields the venue dashboard needs.
--
-- Until now `events` carried only `event_date` (a DATE), so the panel could not
-- show time ranges, a day plan ordered by hour, or any status. These four
-- columns are what turn the dashboard's "Дневен план", status pills and
-- time ranges into real data rather than derived guesses.
--
-- All columns are nullable / defaulted so existing rows stay valid.

alter table events
  add column start_time time,
  add column end_time time,
  -- Lifecycle of the event as tracked by venue staff. 'preparation' is the
  -- default: an event exists because staff booked it, but is not yet confirmed.
  add column status text not null default 'preparation'
    check (status in ('preparation', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  -- Drives the icon/colour coding used across the calendar and event lists.
  add column event_type text not null default 'other'
    check (event_type in ('wedding', 'birthday', 'baptism', 'graduation', 'corporate', 'other'));

-- An event may not end before it starts. Both nullable, so the constraint only
-- applies once staff have filled in a full time range.
alter table events
  add constraint events_time_range_valid
  check (start_time is null or end_time is null or end_time > start_time);

-- The dashboard's day plan and calendar both query by date then order by time.
create index events_venue_date_time_idx on events (venue_id, event_date, start_time);
create index events_venue_status_idx on events (venue_id, status);
