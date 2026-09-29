create extension if not exists pgcrypto;

alter table venues add column layout_lock_password_hash text;
alter table venues alter column layout_lock_password_hash
  set default extensions.crypt('0000', extensions.gen_salt('bf'));
update venues set layout_lock_password_hash = extensions.crypt('0000', extensions.gen_salt('bf'))
  where layout_lock_password_hash is null;

alter table rooms add column width_cm numeric not null default 2000;
alter table rooms add column height_cm numeric not null default 1500;

alter table events add column layout_undo_snapshot jsonb;

create or replace function set_venue_layout_password(p_venue_id uuid, p_password text)
returns boolean
language plpgsql
security definer
as $$
begin
  update venues
  set layout_lock_password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
  where id = p_venue_id and is_venue_staff_for(p_venue_id);
  return found;
end;
$$;

create or replace function verify_venue_layout_password(p_venue_id uuid, p_password text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from venues
    where id = p_venue_id
      and is_venue_staff_for(p_venue_id)
      and layout_lock_password_hash = extensions.crypt(p_password, layout_lock_password_hash)
  );
$$;

grant execute on function set_venue_layout_password(uuid, text) to authenticated;
grant execute on function verify_venue_layout_password(uuid, text) to authenticated;

create table room_fixed_elements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  element_type text not null check (element_type in ('wall', 'pillar', 'door', 'bar_fixed', 'other')),
  x_cm numeric not null,
  y_cm numeric not null,
  width_cm numeric not null check (width_cm > 0),
  height_cm numeric not null check (height_cm > 0),
  rotation_deg numeric not null default 0,
  label text,
  created_at timestamptz not null default now()
);

create index room_fixed_elements_room_id_idx on room_fixed_elements(room_id);

create table room_layout_elements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  element_type text not null check (element_type in ('table', 'stage', 'dance_floor', 'bar_movable', 'other')),
  table_type_id uuid references table_types(id) on delete set null,
  x_cm numeric not null,
  y_cm numeric not null,
  width_cm numeric not null check (width_cm > 0),
  length_cm numeric not null check (length_cm > 0),
  rotation_deg numeric not null default 0,
  label text,
  created_at timestamptz not null default now()
);

create index room_layout_elements_room_id_idx on room_layout_elements(room_id);

create table event_layout_elements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  element_type text not null check (element_type in ('table', 'stage', 'dance_floor', 'bar_movable', 'other')),
  table_type_id uuid references table_types(id) on delete set null,
  x_cm numeric not null,
  y_cm numeric not null,
  width_cm numeric not null check (width_cm > 0),
  length_cm numeric not null check (length_cm > 0),
  rotation_deg numeric not null default 0,
  label text,
  created_at timestamptz not null default now()
);

create index event_layout_elements_event_id_idx on event_layout_elements(event_id);
create index event_layout_elements_room_id_idx on event_layout_elements(room_id);

alter table room_fixed_elements enable row level security;
alter table room_layout_elements enable row level security;
alter table event_layout_elements enable row level security;

create policy "venue staff manage own room fixed elements" on room_fixed_elements
  for all using (
    exists (select 1 from rooms where rooms.id = room_fixed_elements.room_id and is_venue_staff_for(rooms.venue_id))
  ) with check (
    exists (select 1 from rooms where rooms.id = room_fixed_elements.room_id and is_venue_staff_for(rooms.venue_id))
  );

create policy "venue staff manage own room layout elements" on room_layout_elements
  for all using (
    exists (select 1 from rooms where rooms.id = room_layout_elements.room_id and is_venue_staff_for(rooms.venue_id))
  ) with check (
    exists (select 1 from rooms where rooms.id = room_layout_elements.room_id and is_venue_staff_for(rooms.venue_id))
  );

create policy "venue staff manage own event layout elements" on event_layout_elements
  for all using (
    exists (select 1 from events where events.id = event_layout_elements.event_id and is_venue_staff_for(events.venue_id))
  ) with check (
    exists (select 1 from events where events.id = event_layout_elements.event_id and is_venue_staff_for(events.venue_id))
  );

create policy "organizer manage own event layout elements" on event_layout_elements
  for all using (is_organizer_for_event(event_id))
  with check (is_organizer_for_event(event_id));

grant usage on schema public to anon, authenticated, service_role;
grant all on room_fixed_elements, room_layout_elements, event_layout_elements
  to anon, authenticated, service_role;
