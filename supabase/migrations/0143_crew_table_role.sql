-- 0143: a fourth table_role, 'crew' — a dedicated table for the band/
-- photographer/other vendor staff, placed from the palette exactly like the
-- couple's table or the head table (same handleAddSpecialTable flow, no new
-- UI pattern). Rendered in a fixed silver color regardless of how many
-- people are seated at it, matching the couple table's always-on color
-- rather than the head table's occupancy-based coloring — the point is to
-- mark it as "not a guest table" at a glance, not to track its fill state.
--
-- Pure widening of the existing check constraints; no column/shape change,
-- no data migration (existing rows are all 'guest'/'couple'/'head' already).

begin;

alter table room_layout_elements drop constraint room_layout_elements_table_role_check;
alter table room_layout_elements add constraint room_layout_elements_table_role_check
  check (table_role = any (array['guest', 'couple', 'head', 'crew']));

alter table event_layout_elements drop constraint event_layout_elements_table_role_check;
alter table event_layout_elements add constraint event_layout_elements_table_role_check
  check (table_role = any (array['guest', 'couple', 'head', 'crew']));

commit;
