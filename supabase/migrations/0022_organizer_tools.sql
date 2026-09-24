-- supabase/migrations/0022_organizer_tools.sql
-- Sub-project 3: organizer-facing tools (agenda, locations, guest list with
-- organizer-set RSVP, a menu guest-count split, and an invitation builder).
-- No Supabase Auth session exists for couples, so — matching
-- event_credentials/couple_sessions from Sub-project 2 — these tables get
-- RLS enabled with zero anon/authenticated policies; only service_role
-- touches them, and every couple-facing route scopes its own queries by the
-- event_id the auth middleware already resolved.

create table event_agenda_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  time time,
  title text not null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index event_agenda_items_event_id_idx on event_agenda_items(event_id);

create table event_locations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  label text not null,
  address text,
  map_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index event_locations_event_id_idx on event_locations(event_id);

create table event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  full_name text not null,
  phone text,
  party_size integer not null default 1 check (party_size > 0),
  rsvp_status text not null default 'pending'
    check (rsvp_status in ('invited', 'confirmed', 'declined', 'pending')),
  notes text,
  created_at timestamptz not null default now()
);
create index event_guests_event_id_idx on event_guests(event_id);

create table event_menu_item_quantities (
  event_id uuid not null references events(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  guest_count integer check (guest_count is null or guest_count > 0),
  primary key (event_id, menu_item_id)
);

create table event_invitations (
  event_id uuid primary key references events(id) on delete cascade,
  template_id text not null,
  message text,
  photo_path text,
  public_slug text not null unique,
  created_at timestamptz not null default now()
);

alter table event_agenda_items enable row level security;
alter table event_locations enable row level security;
alter table event_guests enable row level security;
alter table event_menu_item_quantities enable row level security;
alter table event_invitations enable row level security;

grant usage on schema public to service_role;
grant all on event_agenda_items, event_locations, event_guests,
  event_menu_item_quantities, event_invitations to service_role;

insert into storage.buckets (id, name, public)
values ('invitation-photos', 'invitation-photos', true)
on conflict (id) do nothing;

create policy "public read invitation photos" on storage.objects
  for select using (bucket_id = 'invitation-photos');
