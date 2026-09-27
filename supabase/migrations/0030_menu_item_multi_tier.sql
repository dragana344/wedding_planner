-- A dish can now belong to both the everyday and special-event menus at
-- once (e.g. a dish sold daily that's also offered at weddings), instead of
-- being forced to pick exactly one and get duplicated to appear in both.
-- Replaces the single-value tier column with an array.

alter table menu_items add column tiers text[];
update menu_items set tiers = array[tier];
alter table menu_items alter column tiers set not null;
alter table menu_items add constraint menu_items_tiers_valid
  check (tiers <@ array['everyday', 'special'] and array_length(tiers, 1) > 0);
alter table menu_items drop column tier;

create index menu_items_tiers_idx on menu_items using gin (tiers);
