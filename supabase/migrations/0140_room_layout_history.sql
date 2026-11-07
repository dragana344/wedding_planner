-- Multi-step undo/redo for the room floor-plan editor (walls/doors + tables),
-- mirroring 0072's events.layout_history for the per-event staff editor.
-- One History object per room (not a map — a room isn't shared across
-- events the way a room id is shared across many events' layout_history).

alter table rooms add column layout_history jsonb;

-- Runs as the caller: RLS ("venue staff manage own room layout/fixed
-- elements") limits this to the caller's own venue's rows, same pattern as
-- restore_staff_layout (0076).
create or replace function public.restore_room_layout(p_room_id uuid, p_elements jsonb, p_fixed jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from room_layout_elements where room_id = p_room_id;
  insert into room_layout_elements (id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm,
                                     rotation_deg, label, group_id, table_role, created_at)
  select coalesce(e.id, gen_random_uuid()), p_room_id, e.element_type,
         (select tt.id from table_types tt where tt.id = e.table_type_id and tt.room_id = p_room_id),
         e.x_cm, e.y_cm, e.width_cm, e.length_cm, coalesce(e.rotation_deg, 0), e.label, e.group_id,
         coalesce(e.table_role, 'guest'), now() + (x.ord * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p_elements, '[]'::jsonb)) with ordinality as x(value, ord)
  cross join lateral jsonb_to_record(x.value) as e(
    id uuid, element_type text, table_type_id uuid, x_cm numeric, y_cm numeric,
    width_cm numeric, length_cm numeric, rotation_deg numeric, label text, group_id uuid, table_role text
  );

  delete from room_fixed_elements where room_id = p_room_id;
  insert into room_fixed_elements (id, room_id, element_type, x_cm, y_cm, width_cm, height_cm, rotation_deg, label, created_at)
  select coalesce(f.id, gen_random_uuid()), p_room_id, f.element_type, f.x_cm, f.y_cm, f.width_cm, f.height_cm,
         coalesce(f.rotation_deg, 0), f.label, now() + (y.ord * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p_fixed, '[]'::jsonb)) with ordinality as y(value, ord)
  cross join lateral jsonb_to_record(y.value) as f(
    id uuid, element_type text, x_cm numeric, y_cm numeric, width_cm numeric, height_cm numeric,
    rotation_deg numeric, label text
  );
end;
$$;

revoke all on function public.restore_room_layout(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.restore_room_layout(uuid, jsonb, jsonb) to authenticated, service_role;
