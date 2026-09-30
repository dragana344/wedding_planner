-- 0075 (Session 3): "Маса N" follows the order tables were placed
-- (event_room_tables orders confirmed tables by created_at). A confirm writes
-- every table in one statement, so they all got the same created_at and the
-- numbers came out in id order. Each row now gets its position as an offset.

create or replace function public.confirm_event_seating(p_event_id uuid, p_room_id uuid, p_elements jsonb, p_confirmed_at text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from event_layout_elements where event_id = p_event_id and room_id = p_room_id;
  insert into event_layout_elements (id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm,
                                     rotation_deg, label, group_id, table_role, created_at)
  select coalesce(e.id, gen_random_uuid()), p_event_id, p_room_id, e.element_type, e.table_type_id, e.x_cm, e.y_cm,
         e.width_cm, e.length_cm, e.rotation_deg, e.label, e.group_id, coalesce(e.table_role, 'guest'),
         now() + (x.ord * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p_elements, '[]'::jsonb)) with ordinality as x(value, ord)
  cross join lateral jsonb_to_record(x.value) as e(
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
