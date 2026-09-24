-- Replaces the single events.couple_user_id link with a proper many-to-many
-- table: one event can have several organizers (e.g. bride + groom, or
-- several class presidents for a graduation party), each with their own login.

create table event_organizers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_organizers_event_id_idx on event_organizers(event_id);
create index event_organizers_user_id_idx on event_organizers(user_id);

-- Carry forward any existing single-organizer links before dropping the column.
insert into event_organizers (event_id, user_id)
select id, couple_user_id from events where couple_user_id is not null;

-- Must drop first: this policy depends on the column being removed below.
drop policy "couple reads own event" on events;

alter table events drop column couple_user_id;

alter table event_organizers enable row level security;

create policy "venue staff manage own event organizers" on event_organizers
  for all using (
    exists (
      select 1 from events
      where events.id = event_organizers.event_id and is_venue_staff_for(events.venue_id)
    )
  ) with check (
    exists (
      select 1 from events
      where events.id = event_organizers.event_id and is_venue_staff_for(events.venue_id)
    )
  );

create policy "organizer reads own organizer rows" on event_organizers
  for select using (user_id = auth.uid());

grant usage on schema public to anon, authenticated, service_role;
grant all on event_organizers to anon, authenticated, service_role;

-- New events read policy, based on event_organizers membership instead of
-- the now-removed couple_user_id column.
create policy "organizer reads own event" on events
  for select using (
    exists (
      select 1 from event_organizers
      where event_organizers.event_id = events.id and event_organizers.user_id = auth.uid()
    )
  );
