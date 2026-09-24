-- Removes the end_time > start_time constraint added in 0014.
--
-- That check was wrong for this domain: weddings, graduation parties and New
-- Year events routinely run past midnight (e.g. 20:00 → 02:00), and the
-- constraint rejected exactly those rows. Because `start_time`/`end_time` are
-- wall-clock TIME values scoped to `event_date`, an end_time earlier than
-- start_time is the correct encoding of "ends the following morning" rather
-- than invalid data.
--
-- Consumers computing a duration must therefore treat end_time < start_time as
-- crossing midnight and add 24h.

alter table events drop constraint if exists events_time_range_valid;
