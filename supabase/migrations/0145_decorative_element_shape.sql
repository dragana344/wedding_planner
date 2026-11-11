-- 0145: a shape for non-table movable elements (flowers, lanterns, any
-- decorative "other" item), so they can render round or rectangular like
-- actual tables do. Tables keep getting their shape from table_types via
-- table_type_id — this column only matters for element_type <> 'table'.

begin;

alter table public.room_layout_elements
  add column shape text check (shape in ('round', 'rectangular'));

alter table public.event_layout_elements
  add column shape text check (shape in ('round', 'rectangular'));

commit;
