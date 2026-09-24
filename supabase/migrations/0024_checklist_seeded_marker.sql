-- Marks whether an event's checklist has ever been seeded with the starter
-- tasks, so listChecklistItems seeds exactly once per event — not "whenever
-- the table happens to be empty" (which previously caused starter tasks to
-- reappear if a couple deleted all of them).
alter table events add column checklist_seeded_at timestamptz;
