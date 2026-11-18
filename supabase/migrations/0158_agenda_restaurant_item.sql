-- 0158: a new event's agenda starts with the restaurant already in it: one
-- item, titled with the venue's name, at the event's start time, with the
-- booked hall(s) and their address as its place. It is added once, when the
-- event gets its first hall, and from then on it is an ordinary agenda item
-- (the couple can edit or delete it; deleting it does not bring it back).
--
--   * place:   "<venue> – <hall, hall>"; address and map link are the first
--              booked hall's own (0157), else the venue's address
--              (venues.address); no map link is stored when neither hall has
--              one (the page and the invitation build a map search from the
--              address).
--   * skipped: table-reservation ("mini") events, which have no programme.
--   * existing events are marked as done below, so no couple's agenda
--     changes under them.

alter table public.events add column agenda_seeded_at timestamptz;
update public.events set agenda_seeded_at = now();

create or replace function public.seed_event_agenda_restaurant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
  v_venue record;
  v_halls text;
  v_address text;
  v_map text;
begin
  -- Locks the event row, so two rooms inserted at once can't seed twice.
  select * into v_event from public.events where id = new.event_id for update;
  if not found or v_event.agenda_seeded_at is not null or v_event.seating_mode = 'mini' then
    return new;
  end if;
  update public.events set agenda_seeded_at = now() where id = v_event.id;

  select name, address into v_venue from public.venues where id = v_event.venue_id;
  if not found then return new; end if;

  select string_agg(r.name, ', ' order by r.name),
         (array_agg(nullif(btrim(r.address), '') order by r.name) filter (where nullif(btrim(r.address), '') is not null))[1],
         (array_agg(r.map_url order by r.name) filter (where r.map_url is not null))[1]
    into v_halls, v_address, v_map
    from public.event_rooms er
    join public.rooms r on r.id = er.room_id
   where er.event_id = v_event.id;

  insert into public.event_agenda_items (event_id, time, title, location, address, map_url, sort_order)
  values (
    v_event.id,
    v_event.start_time,
    left(v_venue.name, 300),
    left(v_venue.name || coalesce(' – ' || v_halls, ''), 200),
    coalesce(v_address, nullif(btrim(v_venue.address), '')),
    v_map,
    0
  );
  return new;
end;
$$;

revoke all on function public.seed_event_agenda_restaurant() from public, anon, authenticated;

create trigger event_rooms_seed_agenda
  after insert on public.event_rooms
  for each row execute function public.seed_event_agenda_restaurant();
