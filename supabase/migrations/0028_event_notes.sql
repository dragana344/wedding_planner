-- supabase/migrations/0028_event_notes.sql
-- A list of freeform notes per event, for the couple to jot down anything
-- that doesn't fit the structured tools (checklist, budget, guests) — vendor
-- questions, ideas, things to ask the venue. One event has many notes, each
-- with an optional title (falls back to the note's first line when blank —
-- handled in application code, not the schema). Same organizer-only,
-- service_role-only access pattern as every other couple-facing table since
-- Sub-project 2.

create table event_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_notes_event_id_idx on event_notes(event_id);

alter table event_notes enable row level security;

grant usage on schema public to service_role;
grant all on event_notes to service_role;
