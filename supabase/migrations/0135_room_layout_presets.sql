-- 0135: Project A (seating remodel), spec §2 — a room can have more than
-- one saved, named layout instead of today's single standard layout.
-- Snapshot-based (jsonb), same approach lib/seating/history.ts already uses
-- for undo, rather than a normalized per-element table: a preset is loaded
-- wholesale (every field needed to recreate each element), never queried
-- element-by-element.

begin;

create table public.room_layout_presets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- { fixed: FixedElement[], elements: RoomLayoutElement[] } minus id/room_id
  -- (and created_at for elements) — those are assigned fresh on load.
  snapshot jsonb not null check (octet_length(snapshot::text) <= 1500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, name)
);

create index room_layout_presets_room_id_idx on public.room_layout_presets(room_id);

alter table public.room_layout_presets enable row level security;

create policy "venue staff manage own room presets" on public.room_layout_presets
  for all using (
    exists (select 1 from rooms where rooms.id = room_layout_presets.room_id and is_venue_staff_for(rooms.venue_id))
  ) with check (
    exists (select 1 from rooms where rooms.id = room_layout_presets.room_id and is_venue_staff_for(rooms.venue_id))
  );

grant all on public.room_layout_presets to authenticated, service_role;

commit;
