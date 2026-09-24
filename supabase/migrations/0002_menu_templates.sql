create table menu_templates (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_template_id uuid not null references menu_templates(id) on delete cascade,
  course text not null check (course in ('starter', 'main', 'dessert', 'other')),
  name text not null,
  allergen_tags text[] not null default '{}',
  is_vegetarian boolean not null default false,
  is_vegan boolean not null default false,
  created_at timestamptz not null default now()
);

create index menu_templates_venue_id_idx on menu_templates(venue_id);
create index menu_items_menu_template_id_idx on menu_items(menu_template_id);

-- Standard Supabase default privileges: grant table access to the anon,
-- authenticated, and service_role roles. RLS (added in Task 5) is what
-- actually restricts access for anon/authenticated; service_role bypasses
-- RLS but still requires these grants to read/write at all.
grant usage on schema public to anon, authenticated, service_role;
grant all on menu_templates, menu_items to anon, authenticated, service_role;
