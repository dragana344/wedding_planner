-- 0100: a manager's forgot-password flow (spec §6) — the same opaque,
-- hashed-at-rest, time-boxed token pattern as couple_sessions and
-- venue_manager_elevations, scoped to one manager at a time.

begin;

create table venue_manager_password_resets (
  token text primary key,
  venue_id uuid not null references venues(id) on delete cascade,
  manager_id uuid not null references venue_managers(id) on delete cascade,
  manager_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index venue_manager_password_resets_venue_id_idx on venue_manager_password_resets(venue_id);
create index venue_manager_password_resets_manager_id_idx on venue_manager_password_resets(manager_id);

alter table venue_manager_password_resets enable row level security;

commit;
