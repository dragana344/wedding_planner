-- 0072 (Session 3, task 5): table groups and multi-step undo/redo.
--
--   group_id          tables sharing one id form a logical group ("+
--                     Групирај"), shown with one dashed outline and a summed
--                     capacity. On the room's standard layout too, so a
--                     venue's usual groupings copy into new events.
--   seating_history   the couple's per-room undo/redo stack, and
--   layout_history    staff's, both { room_id: { past: [], future: [] } }
--                     where each entry is { elements, seats } (see
--                     lib/seating/history.ts). They hold table labels and
--                     guest names, so they are personal data: erasure
--                     empties them.
--   restore_room_seats
--                     undo/redo puts a room's seats back from a snapshot,
--                     skipping seats whose guest or table no longer exists.

alter table public.room_layout_elements add column group_id uuid;
alter table public.event_layout_elements add column group_id uuid;
alter table public.events add column seating_history jsonb not null default '{}'::jsonb;
alter table public.events add column layout_history jsonb not null default '{}'::jsonb;

-- Confirm also carries group_id (same signature as 0070).
create or replace function public.confirm_event_seating(p_event_id uuid, p_room_id uuid, p_elements jsonb, p_confirmed_at text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from event_layout_elements where event_id = p_event_id and room_id = p_room_id;
  insert into event_layout_elements (id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm, rotation_deg, label, group_id)
  select coalesce(e.id, gen_random_uuid()), p_event_id, p_room_id, e.element_type, e.table_type_id, e.x_cm, e.y_cm,
         e.width_cm, e.length_cm, e.rotation_deg, e.label, e.group_id
  from jsonb_to_recordset(coalesce(p_elements, '[]'::jsonb)) as e(
    id uuid, element_type text, table_type_id uuid, x_cm numeric, y_cm numeric,
    width_cm numeric, length_cm numeric, rotation_deg numeric, label text, group_id uuid
  );
  update events
  set seating_confirmed_at = coalesce(seating_confirmed_at, '{}'::jsonb) || jsonb_build_object(p_room_id::text, p_confirmed_at)
  where id = p_event_id;
end;
$$;

revoke all on function public.confirm_event_seating(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.confirm_event_seating(uuid, uuid, jsonb, text) to service_role;

create or replace function public.restore_room_seats(p_event_id uuid, p_room_id uuid, p_seats jsonb)
returns integer
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_seat record;
  v_restored integer := 0;
begin
  delete from event_seat_assignments where event_id = p_event_id and room_id = p_room_id;
  for v_seat in
    select * from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb))
      as s(layout_element_id uuid, seat_number integer, guest_id uuid, guest_name text)
  loop
    begin
      insert into event_seat_assignments (event_id, room_id, layout_element_id, seat_number, guest_id, guest_name)
      values (p_event_id, p_room_id, v_seat.layout_element_id, v_seat.seat_number, v_seat.guest_id, v_seat.guest_name);
      v_restored := v_restored + 1;
    exception
      -- Guest deleted (FK), table gone or smaller (trigger), seat taken twice.
      when foreign_key_violation or check_violation or unique_violation or not_null_violation then
        null;
    end;
  end loop;
  return v_restored;
end;
$$;

revoke all on function public.restore_room_seats(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_room_seats(uuid, uuid, jsonb) to service_role;

-- Erasure (0043 marks the event): the histories go with the rest.
create or replace function public.erase_event_layout_histories()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  new.seating_history := '{}'::jsonb;
  new.layout_history := '{}'::jsonb;
  return new;
end;
$$;

revoke all on function public.erase_event_layout_histories() from public, anon, authenticated;

create trigger events_erase_layout_histories
  before update of personal_data_erased_at on public.events
  for each row
  when (new.personal_data_erased_at is not null and old.personal_data_erased_at is distinct from new.personal_data_erased_at)
  execute function public.erase_event_layout_histories();

-- Seatable tables of a room: the couple's draft when they have one for this
-- room (even an empty one), otherwise the confirmed layout — never a mix.
-- (0070 merged the two, so a table the couple removed from the draft still
-- counted through its confirmed copy and kept its seats.)
create or replace function public.event_room_tables(p_event_id uuid, p_room_id uuid)
returns table (element_id uuid, table_type_id uuid, label text, ord integer, capacity integer)
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  with ev as (
    select seating_draft -> p_room_id::text as draft
    from public.events where id = p_event_id
  ),
  draft as (
    select (e.value ->> 'id')::uuid as element_id,
           nullif(e.value ->> 'table_type_id', '')::uuid as table_type_id,
           nullif(btrim(e.value ->> 'label'), '') as label,
           e.ordinality as pos
    from ev
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(ev.draft) = 'array' then ev.draft else '[]'::jsonb end
    ) with ordinality as e(value, ordinality)
    where e.value ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and nullif(e.value ->> 'table_type_id', '') is not null
  ),
  live as (
    select el.id as element_id, el.table_type_id, nullif(btrim(el.label), '') as label,
           row_number() over (order by el.created_at, el.id) as pos
    from public.event_layout_elements el
    where el.event_id = p_event_id and el.room_id = p_room_id and el.table_type_id is not null
      and not exists (select 1 from ev where jsonb_typeof(ev.draft) = 'array')
  ),
  merged as (
    select d.element_id, d.table_type_id, d.label, d.pos from draft d
    union all
    select l.element_id, l.table_type_id, l.label, l.pos from live l
  )
  select m.element_id, m.table_type_id, m.label,
         (row_number() over (order by m.pos))::integer as ord,
         tt.seats as capacity
  from merged m
  join public.table_types tt on tt.id = m.table_type_id and tt.room_id = p_room_id;
$$;

revoke all on function public.event_room_tables(uuid, uuid) from public, anon, authenticated;
grant execute on function public.event_room_tables(uuid, uuid) to service_role;

-- Staff undo/redo restores seats too; RLS still limits them to their venue
-- (this function is not security definer).
grant execute on function public.restore_room_seats(uuid, uuid, jsonb) to authenticated;

-- prune_event_seat_assignments reads event_room_tables (service role only),
-- so for staff it runs as definer behind the same check as the seat lists:
-- service role, or staff of the event's venue (else 42501).
create or replace function public.prune_event_seat_assignments(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_removed integer;
begin
  perform assert_event_seating_reader(p_event_id);
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
grant execute on function public.prune_event_seat_assignments(uuid) to authenticated, service_role;
