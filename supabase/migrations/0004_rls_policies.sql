create table venue_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade
);

create or replace function is_venue_staff_for(target_venue_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from venue_staff
    where user_id = auth.uid() and venue_id = target_venue_id
  );
$$;

alter table venues enable row level security;
alter table rooms enable row level security;
alter table table_types enable row level security;
alter table menu_templates enable row level security;
alter table menu_items enable row level security;
alter table events enable row level security;
alter table event_rooms enable row level security;

create policy "venue staff read own venue" on venues
  for select using (is_venue_staff_for(id));

create policy "venue staff manage own rooms" on rooms
  for all using (is_venue_staff_for(venue_id)) with check (is_venue_staff_for(venue_id));

create policy "venue staff manage own table types" on table_types
  for all using (
    exists (select 1 from rooms where rooms.id = table_types.room_id and is_venue_staff_for(rooms.venue_id))
  ) with check (
    exists (select 1 from rooms where rooms.id = table_types.room_id and is_venue_staff_for(rooms.venue_id))
  );

create policy "venue staff manage own menu templates" on menu_templates
  for all using (is_venue_staff_for(venue_id)) with check (is_venue_staff_for(venue_id));

create policy "venue staff manage own menu items" on menu_items
  for all using (
    exists (select 1 from menu_templates where menu_templates.id = menu_items.menu_template_id and is_venue_staff_for(menu_templates.venue_id))
  ) with check (
    exists (select 1 from menu_templates where menu_templates.id = menu_items.menu_template_id and is_venue_staff_for(menu_templates.venue_id))
  );

-- venue staff: full access to events in their venue
create policy "venue staff manage own events" on events
  for all using (is_venue_staff_for(venue_id)) with check (is_venue_staff_for(venue_id));

-- couples: read-only access to their own single event
create policy "couple reads own event" on events
  for select using (couple_user_id = auth.uid());

create policy "venue staff manage own event_rooms" on event_rooms
  for all using (
    exists (select 1 from events where events.id = event_rooms.event_id and is_venue_staff_for(events.venue_id))
  ) with check (
    exists (select 1 from events where events.id = event_rooms.event_id and is_venue_staff_for(events.venue_id))
  );

-- Standard Supabase default privileges: grant table access to the anon,
-- authenticated, and service_role roles. RLS (enabled above) is what
-- actually restricts access for anon/authenticated on the tables it's
-- enabled on; service_role bypasses RLS but still requires these grants
-- to read/write at all.
grant usage on schema public to anon, authenticated, service_role;
grant all on venues, rooms, table_types, menu_templates, menu_items, events, event_rooms
  to anon, authenticated, service_role;

-- venue_staff itself is intentionally NOT granted to anon/authenticated:
-- staff-to-venue assignment must only be manageable via service_role
-- (e.g. an admin backend), never directly by end users. RLS is enabled
-- with no policies as defense in depth, so even a future stray grant
-- would still deny anon/authenticated access by default.
alter table venue_staff enable row level security;
grant all on venue_staff to service_role;
