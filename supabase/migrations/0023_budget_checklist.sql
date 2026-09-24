-- supabase/migrations/0023_budget_checklist.sql
-- Sub-project 4: a budget tracker and a checklist, both organizer-only.
-- Same access pattern as every couple-facing table since Sub-project 2:
-- RLS enabled with zero anon/authenticated policies, service_role only —
-- authorization is enforced entirely in application code, scoped by the
-- event_id the auth middleware already resolved.

create table event_budget_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category text not null check (category in (
    'catering', 'photography', 'videography', 'flowers_decor',
    'music_entertainment', 'attire', 'invitations_stationery',
    'transportation', 'other'
  )),
  custom_label text,
  name text not null,
  estimated_amount numeric check (estimated_amount is null or estimated_amount >= 0),
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  created_at timestamptz not null default now()
);
create index event_budget_items_event_id_idx on event_budget_items(event_id);

create table event_checklist_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  due_date date,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index event_checklist_items_event_id_idx on event_checklist_items(event_id);

alter table event_budget_items enable row level security;
alter table event_checklist_items enable row level security;

grant usage on schema public to service_role;
grant all on event_budget_items, event_checklist_items to service_role;
