create table events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  -- nullable until the couple account is provisioned (Task 6)
  couple_user_id uuid references auth.users(id) on delete set null,
  couple_names text not null,
  event_date date not null,
  guest_count_estimate integer,
  menu_template_id uuid references menu_templates(id) on delete set null,
  created_at timestamptz not null default now()
);

create table event_rooms (
  event_id uuid not null references events(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  primary key (event_id, room_id)
);

create index events_venue_id_idx on events(venue_id);
create index events_couple_user_id_idx on events(couple_user_id);

-- Standard Supabase default privileges: grant table access to the anon,
-- authenticated, and service_role roles. RLS (added in Task 5) is what
-- actually restricts access for anon/authenticated; service_role bypasses
-- RLS but still requires these grants to read/write at all.
grant usage on schema public to anon, authenticated, service_role;
grant all on events, event_rooms to anon, authenticated, service_role;
