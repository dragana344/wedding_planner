-- Menu items become a venue-owned shared pool instead of belonging to one
-- template, so the same dish (e.g. "Печено пиле") can appear in multiple
-- standard packages without retyping it, and staff/organizers can browse
-- one flat list rather than duplicated per-menu copies. Each item is tagged
-- 'everyday' (the restaurant's regular menu) or 'special' (only offered for
-- weddings/graduations/etc). Standard package templates now COMPOSE special
-- items via a join table instead of owning them directly.

alter table menu_items add column venue_id uuid references venues(id) on delete cascade;
update menu_items set venue_id = menu_templates.venue_id
  from menu_templates where menu_templates.id = menu_items.menu_template_id;
alter table menu_items alter column venue_id set not null;

alter table menu_items add column tier text not null default 'special' check (tier in ('everyday', 'special'));

create table menu_template_items (
  menu_template_id uuid not null references menu_templates(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  primary key (menu_template_id, menu_item_id)
);

insert into menu_template_items (menu_template_id, menu_item_id)
  select menu_template_id, id from menu_items where menu_template_id is not null;

drop policy "venue staff manage own menu items" on menu_items;

alter table menu_items drop column menu_template_id;

create index menu_items_venue_id_idx on menu_items(venue_id);
create index menu_template_items_menu_item_id_idx on menu_template_items(menu_item_id);

alter table menu_template_items enable row level security;

create policy "venue staff manage own menu items" on menu_items
  for all using (is_venue_staff_for(venue_id)) with check (is_venue_staff_for(venue_id));

-- Mirrors the join-check pattern from 0006/0017: a template and an item can
-- each independently pass is_venue_staff_for while belonging to different
-- venues, so the policy also confirms the item's venue matches the
-- template's venue before allowing the link.
create policy "venue staff manage own menu template items" on menu_template_items
  for all using (
    exists (
      select 1 from menu_templates
      join menu_items on menu_items.id = menu_template_items.menu_item_id
      where menu_templates.id = menu_template_items.menu_template_id
        and is_venue_staff_for(menu_templates.venue_id)
        and menu_items.venue_id = menu_templates.venue_id
    )
  ) with check (
    exists (
      select 1 from menu_templates
      join menu_items on menu_items.id = menu_template_items.menu_item_id
      where menu_templates.id = menu_template_items.menu_template_id
        and is_venue_staff_for(menu_templates.venue_id)
        and menu_items.venue_id = menu_templates.venue_id
    )
  );

grant all on menu_template_items to anon, authenticated, service_role;
