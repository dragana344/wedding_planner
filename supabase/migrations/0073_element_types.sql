-- 0073 (Session 3, task 6): the real elements of a hall (B4).
--
--   fixed (room_fixed_elements):   + entrance, wc      (pillar, door, wall, bar_fixed exist)
--   movable (room/event layout):   + music, photo_stage (stage, dance_floor, bar_movable exist)
--   table_role on tables:          guest (default) | couple (маса на младенците) | head (главна маса)
--
-- Numbering: only guest tables get "Маса N"; couple/head tables are named by
-- their role unless the couple typed a label. A label equal to the table
-- type's name (what the editor used to fill in) counts as no label.

alter table public.room_fixed_elements drop constraint room_fixed_elements_element_type_check;
alter table public.room_fixed_elements add constraint room_fixed_elements_element_type_check
  check (element_type in ('wall', 'pillar', 'door', 'bar_fixed', 'entrance', 'wc', 'other'));

alter table public.room_layout_elements drop constraint room_layout_elements_element_type_check;
alter table public.room_layout_elements add constraint room_layout_elements_element_type_check
  check (element_type in ('table', 'stage', 'dance_floor', 'bar_movable', 'music', 'photo_stage', 'other'));

alter table public.event_layout_elements drop constraint event_layout_elements_element_type_check;
alter table public.event_layout_elements add constraint event_layout_elements_element_type_check
  check (element_type in ('table', 'stage', 'dance_floor', 'bar_movable', 'music', 'photo_stage', 'other'));

alter table public.room_layout_elements add column table_role text not null default 'guest'
  check (table_role in ('guest', 'couple', 'head'));
alter table public.event_layout_elements add column table_role text not null default 'guest'
  check (table_role in ('guest', 'couple', 'head'));

create or replace function public.table_role_name(p_role text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select case p_role when 'couple' then 'Маса на младенците' when 'head' then 'Главна маса' end;
$$;

revoke all on function public.table_role_name(text) from public, anon, authenticated;
grant execute on function public.table_role_name(text) to service_role;

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
           coalesce(nullif(e.value ->> 'table_role', ''), 'guest') as table_role,
           e.ordinality as pos
    from ev
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(ev.draft) = 'array' then ev.draft else '[]'::jsonb end
    ) with ordinality as e(value, ordinality)
    where e.value ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and nullif(e.value ->> 'table_type_id', '') is not null
  ),
  live as (
    select el.id as element_id, el.table_type_id, nullif(btrim(el.label), '') as label, el.table_role,
           row_number() over (order by el.created_at, el.id) as pos
    from public.event_layout_elements el
    where el.event_id = p_event_id and el.room_id = p_room_id and el.table_type_id is not null
      and not exists (select 1 from ev where jsonb_typeof(ev.draft) = 'array')
  ),
  merged as (
    select d.element_id, d.table_type_id, d.label, d.table_role, d.pos from draft d
    union all
    select l.element_id, l.table_type_id, l.label, l.table_role, l.pos from live l
  ),
  typed as (
    select m.*, tt.seats,
           case when m.label = tt.name then null else m.label end as own_label
    from merged m
    join public.table_types tt on tt.id = m.table_type_id and tt.room_id = p_room_id
  )
  select t.element_id, t.table_type_id,
         coalesce(t.own_label, table_role_name(t.table_role)) as label,
         case when t.table_role = 'guest'
              then (row_number() over (partition by t.table_role = 'guest' order by t.pos))::integer
              else 0 end as ord,
         t.seats as capacity
  from typed t
  order by t.pos;
$$;

revoke all on function public.event_room_tables(uuid, uuid) from public, anon, authenticated;
grant execute on function public.event_room_tables(uuid, uuid) to service_role;

-- Confirm carries table_role too (same signature as 0070/0072).
create or replace function public.confirm_event_seating(p_event_id uuid, p_room_id uuid, p_elements jsonb, p_confirmed_at text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from event_layout_elements where event_id = p_event_id and room_id = p_room_id;
  insert into event_layout_elements (id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm,
                                     rotation_deg, label, group_id, table_role)
  select coalesce(e.id, gen_random_uuid()), p_event_id, p_room_id, e.element_type, e.table_type_id, e.x_cm, e.y_cm,
         e.width_cm, e.length_cm, e.rotation_deg, e.label, e.group_id, coalesce(e.table_role, 'guest')
  from jsonb_to_recordset(coalesce(p_elements, '[]'::jsonb)) as e(
    id uuid, element_type text, table_type_id uuid, x_cm numeric, y_cm numeric,
    width_cm numeric, length_cm numeric, rotation_deg numeric, label text, group_id uuid, table_role text
  );
  update events
  set seating_confirmed_at = coalesce(seating_confirmed_at, '{}'::jsonb) || jsonb_build_object(p_room_id::text, p_confirmed_at)
  where id = p_event_id;
end;
$$;

revoke all on function public.confirm_event_seating(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.confirm_event_seating(uuid, uuid, jsonb, text) to service_role;
