-- 0070 (Session 3, task 1): guest -> seat assignments.
--
-- event_seat_assignments is the single source of truth for "who sits where".
-- Session 2 reads it through guest_seat() (personal agenda, "Каде седам?").
--
-- A seat belongs to a table of the event's layout. The couple edits a private
-- draft (events.seating_draft, 0020) and confirms it into
-- event_layout_elements, so a table the couple just placed exists only in the
-- draft. layout_element_id therefore has no foreign key: the validation
-- trigger checks the table exists in the draft or the confirmed layout, and
-- prune_event_seat_assignments() removes seats whose table went away or shrank.
-- confirm_event_seating now keeps the draft's element ids, so confirming does
-- not detach anyone.
--
-- Deviation from the MASTER contract, on purpose: a guest row carries
-- party_size (a family of 4 is one row), so a guest may hold up to party_size
-- seats instead of exactly one. guest_seat() returns one row per seat.

create table public.event_seat_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  layout_element_id uuid not null,
  seat_number integer not null check (seat_number between 1 and 1000),
  guest_id uuid references public.event_guests(id) on delete cascade,
  guest_name text check (guest_name is null or char_length(btrim(guest_name)) between 1 and 200),
  updated_at timestamptz not null default now(),
  constraint event_seat_assignments_someone check (guest_id is not null or guest_name is not null),
  constraint event_seat_assignments_one_per_seat unique (layout_element_id, seat_number)
);

create index event_seat_assignments_event_id_idx on public.event_seat_assignments (event_id);
create index event_seat_assignments_room_id_idx on public.event_seat_assignments (room_id);
create index event_seat_assignments_guest_id_idx on public.event_seat_assignments (guest_id);

-- ---------------------------------------------------------------------------
-- The seatable tables of one event room: the couple's draft when there is
-- one (numbered first, in array order), then any confirmed table the draft
-- lacks (staff may seat on what they see; numbered by created_at). ord is
-- the default "Маса N".
-- ---------------------------------------------------------------------------

create or replace function public.event_room_tables(p_event_id uuid, p_room_id uuid)
returns table (element_id uuid, table_type_id uuid, label text, ord integer, capacity integer)
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  with draft as (
    select (e.value ->> 'id')::uuid as element_id,
           nullif(e.value ->> 'table_type_id', '')::uuid as table_type_id,
           nullif(btrim(e.value ->> 'label'), '') as label,
           e.ordinality as pos
    from public.events ev
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(ev.seating_draft -> p_room_id::text) = 'array'
           then ev.seating_draft -> p_room_id::text else '[]'::jsonb end
    ) with ordinality as e(value, ordinality)
    where ev.id = p_event_id
      and e.value ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and nullif(e.value ->> 'table_type_id', '') is not null
  ),
  live as (
    select el.id as element_id, el.table_type_id, nullif(btrim(el.label), '') as label,
           row_number() over (order by el.created_at, el.id) as pos
    from public.event_layout_elements el
    where el.event_id = p_event_id and el.room_id = p_room_id and el.table_type_id is not null
  ),
  merged as (
    select d.element_id, d.table_type_id, d.label, 0 as src, d.pos from draft d
    union all
    select l.element_id, l.table_type_id, l.label, 1 as src, l.pos from live l
    where not exists (select 1 from draft d where d.element_id = l.element_id)
  )
  select m.element_id, m.table_type_id, m.label,
         (row_number() over (order by m.src, m.pos))::integer as ord,
         tt.seats as capacity
  from merged m
  join public.table_types tt on tt.id = m.table_type_id and tt.room_id = p_room_id;
$$;

revoke all on function public.event_room_tables(uuid, uuid) from public, anon, authenticated;
grant execute on function public.event_room_tables(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Validation: room in the event, table in the layout, seat within capacity,
-- guest of the same event holding at most party_size seats.
-- ---------------------------------------------------------------------------

create or replace function public.validate_event_seat_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_capacity integer;
  v_guest_event uuid;
  v_party integer;
  v_taken integer;
begin
  -- Serialise seat writes per event so the party_size count is exact.
  perform pg_advisory_xact_lock(hashtext('event_seats:' || new.event_id::text));

  if not exists (select 1 from event_rooms where event_id = new.event_id and room_id = new.room_id) then
    raise exception 'Room is not assigned to this event.' using errcode = '23514';
  end if;

  select t.capacity into v_capacity
  from event_room_tables(new.event_id, new.room_id) t
  where t.element_id = new.layout_element_id;
  if v_capacity is null then
    raise exception 'Table is not part of this event''s layout.' using errcode = '23514';
  end if;
  if new.seat_number > v_capacity then
    raise exception 'Seat % is beyond the table''s % seats.', new.seat_number, v_capacity using errcode = '23514';
  end if;

  if new.guest_id is not null then
    select event_id, party_size into v_guest_event, v_party from event_guests where id = new.guest_id;
    if v_guest_event is distinct from new.event_id then
      raise exception 'Guest does not belong to this event.' using errcode = '23514';
    end if;
    select count(*) into v_taken
    from event_seat_assignments
    where guest_id = new.guest_id and id <> new.id;
    if v_taken >= v_party then
      raise exception 'Guest already holds all % of their seats.', v_party using errcode = '23514';
    end if;
  end if;

  new.guest_name := nullif(btrim(new.guest_name), '');
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_event_seat_assignment() from public, anon, authenticated;

create trigger event_seat_assignments_validate
  before insert or update on public.event_seat_assignments
  for each row execute function public.validate_event_seat_assignment();

-- ---------------------------------------------------------------------------
-- Cleanup after layout edits: drop seats whose table left the layout or whose
-- number is now beyond the table's capacity. Returns how many were removed.
-- ---------------------------------------------------------------------------

create or replace function public.prune_event_seat_assignments(p_event_id uuid)
returns integer
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_removed integer;
begin
  perform pg_advisory_xact_lock(hashtext('event_seats:' || p_event_id::text));
  delete from event_seat_assignments s
  where s.event_id = p_event_id
    and not exists (
      select 1 from event_room_tables(s.event_id, s.room_id) t
      where t.element_id = s.layout_element_id and s.seat_number <= t.capacity
    );
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function public.prune_event_seat_assignments(uuid) from public, anon, authenticated;
grant execute on function public.prune_event_seat_assignments(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Contract for Session 2: where does this guest sit? One row per seat.
-- ---------------------------------------------------------------------------

create or replace function public.guest_seat(p_guest_id uuid)
returns table (table_label text, seat_number integer, room_name text)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(t.label, 'Маса ' || t.ord) as table_label, s.seat_number, r.name as room_name
  from event_seat_assignments s
  join rooms r on r.id = s.room_id
  cross join lateral event_room_tables(s.event_id, s.room_id) t
  where s.guest_id = p_guest_id and t.element_id = s.layout_element_id
  order by r.name, t.ord, s.seat_number;
$$;

revoke all on function public.guest_seat(uuid) from public, anon, authenticated;
grant execute on function public.guest_seat(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Confirming keeps the draft's element ids (was: fresh ids every time), so
-- the seats on those tables stay attached.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_event_seating(p_event_id uuid, p_room_id uuid, p_elements jsonb, p_confirmed_at text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from event_layout_elements where event_id = p_event_id and room_id = p_room_id;
  insert into event_layout_elements (id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm, rotation_deg, label)
  select coalesce(e.id, gen_random_uuid()), p_event_id, p_room_id, e.element_type, e.table_type_id, e.x_cm, e.y_cm,
         e.width_cm, e.length_cm, e.rotation_deg, e.label
  from jsonb_to_recordset(coalesce(p_elements, '[]'::jsonb)) as e(
    id uuid, element_type text, table_type_id uuid, x_cm numeric, y_cm numeric,
    width_cm numeric, length_cm numeric, rotation_deg numeric, label text
  );
  update events
  set seating_confirmed_at = coalesce(seating_confirmed_at, '{}'::jsonb) || jsonb_build_object(p_room_id::text, p_confirmed_at)
  where id = p_event_id;
end;
$$;

revoke all on function public.confirm_event_seating(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.confirm_event_seating(uuid, uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Erasure (0043): guest-linked seats go with the guests (cascade); free-text
-- names go when the event is marked erased.
-- ---------------------------------------------------------------------------

create or replace function public.erase_event_seat_assignments()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  delete from event_seat_assignments where event_id = new.id;
  return new;
end;
$$;

revoke all on function public.erase_event_seat_assignments() from public, anon, authenticated;

create trigger events_erase_seat_assignments
  after update of personal_data_erased_at on public.events
  for each row
  when (new.personal_data_erased_at is not null and old.personal_data_erased_at is distinct from new.personal_data_erased_at)
  execute function public.erase_event_seat_assignments();

-- ---------------------------------------------------------------------------
-- Access: staff of the event's venue read/write (RLS); the couple's API uses
-- the service role.
-- ---------------------------------------------------------------------------

alter table public.event_seat_assignments enable row level security;
revoke all on public.event_seat_assignments from anon, authenticated;
grant select, insert, update, delete on public.event_seat_assignments to authenticated;
grant all on public.event_seat_assignments to service_role;

create policy "venue staff manage own event seat assignments" on public.event_seat_assignments
  for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_seat_assignments.event_id and public.is_venue_staff_for(e.venue_id)))
  with check (exists (select 1 from public.events e where e.id = event_seat_assignments.event_id and public.is_venue_staff_for(e.venue_id)));
