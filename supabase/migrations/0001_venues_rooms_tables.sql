create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  name text not null,
  -- real-world scale rendering: how many pixels represent one meter on the canvas
  layout_scale_px_per_meter numeric not null default 40,
  -- static zones (walls, dance floor, stage, bar, entrance) as an array of
  -- { type: string, x_cm: number, y_cm: number, width_cm: number, height_cm: number }
  layout_zones jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table table_types (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  shape text not null check (shape in ('round', 'rectangular')),
  seats integer not null check (seats > 0),
  width_cm integer not null check (width_cm > 0),
  length_cm integer not null check (length_cm > 0),
  quantity integer not null check (quantity >= 0),
  created_at timestamptz not null default now()
);

create index rooms_venue_id_idx on rooms(venue_id);
create index table_types_room_id_idx on table_types(room_id);

-- Standard Supabase default privileges: grant table access to the anon,
-- authenticated, and service_role roles. RLS (added in Task 5) is what
-- actually restricts access for anon/authenticated; service_role bypasses
-- RLS but still requires these grants to read/write at all.
grant usage on schema public to anon, authenticated, service_role;
grant all on venues, rooms, table_types to anon, authenticated, service_role;
