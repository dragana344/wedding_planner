-- supabase/migrations/0016_reservations.sql
--
-- Backs the venue panel's "Резервации" and "Брза резервација" sections
-- (currently ready: false in components/venue/shell/nav.ts). A reservation
-- is a lightweight, standalone booking — it never requires an events row.
-- Table assignment reuses room_layout_elements (the individually-addressable
-- table instances a room's standing floor plan already has) rather than a
-- new table registry.

create table reservations (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  guest_name text not null,
  phone text not null,
  email text,
  date date not null,
  start_time time not null,
  end_time time,
  party_size int not null check (party_size > 0),
  status text not null default 'negotiating' check (status in ('confirmed', 'negotiating', 'cancelled')),
  event_type text check (event_type in ('wedding', 'birthday', 'baptism', 'graduation', 'corporate', 'other')),
  note text,
  created_at timestamptz not null default now()
);

create index reservations_venue_date_idx on reservations (venue_id, date, start_time);
create index reservations_room_date_idx on reservations (room_id, date);

create table reservation_tables (
  reservation_id uuid not null references reservations(id) on delete cascade,
  layout_element_id uuid not null references room_layout_elements(id) on delete cascade,
  primary key (reservation_id, layout_element_id)
);

alter table reservations enable row level security;
alter table reservation_tables enable row level security;

create policy "venue staff manage own reservations" on reservations
  for all using (is_venue_staff_for(venue_id)) with check (is_venue_staff_for(venue_id));

create policy "venue staff manage own reservation tables" on reservation_tables
  for all using (
    exists (select 1 from reservations where reservations.id = reservation_tables.reservation_id and is_venue_staff_for(reservations.venue_id))
  ) with check (
    exists (select 1 from reservations where reservations.id = reservation_tables.reservation_id and is_venue_staff_for(reservations.venue_id))
  );

grant usage on schema public to anon, authenticated, service_role;
grant all on reservations, reservation_tables to anon, authenticated, service_role;
