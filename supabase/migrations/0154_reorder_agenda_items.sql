-- 0154: the agenda's ↑/↓ swapped two rows' sort_order. When two rows shared a
-- sort_order (left behind by concurrent adds), the swap changed nothing and
-- the row "didn't move". Moving now rewrites every row's position as 0..n-1 in
-- the order given, in one statement, which also heals any existing duplicates.
create or replace function public.reorder_agenda_items(p_event_id uuid, p_item_ids uuid[])
returns void
language sql
set search_path = public, pg_temp
as $$
  update event_agenda_items t
  set sort_order = o.pos - 1
  from unnest(p_item_ids) with ordinality as o(id, pos)
  where t.id = o.id and t.event_id = p_event_id;
$$;

revoke all on function public.reorder_agenda_items(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_agenda_items(uuid, uuid[]) to service_role;
