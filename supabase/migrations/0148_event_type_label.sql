-- A venue's own name for an event whose type is "Друго" (other), e.g.
-- "Прослава за 20 години брак", picked in the new-event wizard. Shown in
-- place of "Друго" wherever the event's type is named; null for every
-- other type and for "Друго" events created before this.
alter table events
  add column event_type_label text
    check (event_type_label is null or char_length(event_type_label) between 1 and 60);

-- 0117: staff read events column by column (fail-closed for new columns).
grant select (event_type_label) on events to authenticated;
