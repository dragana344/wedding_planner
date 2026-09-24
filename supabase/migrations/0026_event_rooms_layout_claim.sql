-- Atomic claim marker preventing the standard-layout copy race: two
-- concurrent calls to initializeEventLayoutFromStandard (e.g. two overlapping
-- requests to the couple's seating page) could both see "no elements yet"
-- and both copy the room's standard layout in, duplicating every element at
-- identical coordinates. Same pattern as events.checklist_seeded_at.
alter table event_rooms add column layout_initialized_at timestamptz;
