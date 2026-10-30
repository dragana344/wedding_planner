-- 0119: events can have several menus: venue packages plus event-only
-- "custom" menus the manager builds for a single event. Guests then choose per
-- person (counts per menu) and the couple sends the totals to the venue.
--
-- * menu_templates.event_id marks an event-only menu (null = a standard
--   package of the venue). Staff must not create/edit/delete event-only menus
--   or their dishes directly — those go through server routes (service role),
--   so the staff write policies are narrowed to event_id is null. Staff keep
--   reading every menu of their venue.
-- * event_guest_menu_counts: how many of a guest's party eat which menu. Couple
--   data, no policies (service role only), like event_guests itself.
-- * event_menu_submissions: the couple's "send to venue" snapshots; staff read
--   their venue's, only the service role writes.
-- * Counts may only reference a menu linked to the guest's event, and
--   unlinking a menu removes the guests' counts for it.

begin;

alter table menu_templates
  add column event_id uuid null references events(id) on delete cascade;
create index menu_templates_event_id_idx on menu_templates (event_id) where event_id is not null;

drop policy "venue staff manage own menu templates" on menu_templates;

create policy "venue staff read own menu templates" on menu_templates
  for select using (is_venue_staff_for(venue_id));
create policy "venue staff insert own standard menu templates" on menu_templates
  for insert with check (is_venue_staff_for(venue_id) and event_id is null);
create policy "venue staff update own standard menu templates" on menu_templates
  for update using (is_venue_staff_for(venue_id) and event_id is null)
  with check (is_venue_staff_for(venue_id) and event_id is null);
create policy "venue staff delete own standard menu templates" on menu_templates
  for delete using (is_venue_staff_for(venue_id) and event_id is null);

drop policy "venue staff manage own menu template items" on menu_template_items;

-- Same-venue dish check kept (0019): template and dish can each pass
-- is_venue_staff_for while belonging to different venues.
create policy "venue staff read own menu template items" on menu_template_items
  for select using (
    exists (
      select 1 from menu_templates
      join menu_items on menu_items.id = menu_template_items.menu_item_id
      where menu_templates.id = menu_template_items.menu_template_id
        and is_venue_staff_for(menu_templates.venue_id)
        and menu_items.venue_id = menu_templates.venue_id
    )
  );
create policy "venue staff insert own standard menu template items" on menu_template_items
  for insert with check (
    exists (
      select 1 from menu_templates
      join menu_items on menu_items.id = menu_template_items.menu_item_id
      where menu_templates.id = menu_template_items.menu_template_id
        and menu_templates.event_id is null
        and is_venue_staff_for(menu_templates.venue_id)
        and menu_items.venue_id = menu_templates.venue_id
    )
  );
create policy "venue staff update own standard menu template items" on menu_template_items
  for update using (
    exists (
      select 1 from menu_templates
      join menu_items on menu_items.id = menu_template_items.menu_item_id
      where menu_templates.id = menu_template_items.menu_template_id
        and menu_templates.event_id is null
        and is_venue_staff_for(menu_templates.venue_id)
        and menu_items.venue_id = menu_templates.venue_id
    )
  ) with check (
    exists (
      select 1 from menu_templates
      join menu_items on menu_items.id = menu_template_items.menu_item_id
      where menu_templates.id = menu_template_items.menu_template_id
        and menu_templates.event_id is null
        and is_venue_staff_for(menu_templates.venue_id)
        and menu_items.venue_id = menu_templates.venue_id
    )
  );
create policy "venue staff delete own standard menu template items" on menu_template_items
  for delete using (
    exists (
      select 1 from menu_templates
      where menu_templates.id = menu_template_items.menu_template_id
        and menu_templates.event_id is null
        and is_venue_staff_for(menu_templates.venue_id)
    )
  );

create table event_guest_menu_counts (
  guest_id uuid not null references event_guests(id) on delete cascade,
  menu_template_id uuid not null references menu_templates(id) on delete cascade,
  count int not null check (count > 0),
  primary key (guest_id, menu_template_id)
);
create index event_guest_menu_counts_menu_template_id_idx on event_guest_menu_counts (menu_template_id);

alter table event_guest_menu_counts enable row level security;
-- No policies: couple/guest data is reached only through server routes.
grant all on event_guest_menu_counts to service_role;

create table event_menu_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_by text not null,
  counts jsonb not null,
  menu_titles jsonb not null,
  total int not null,
  seen_at timestamptz,
  seen_by text
);
create index event_menu_submissions_event_id_sent_at_idx on event_menu_submissions (event_id, sent_at desc);

alter table event_menu_submissions enable row level security;

create policy "venue staff reads own event_menu_submissions" on event_menu_submissions
  for select using (
    exists (select 1 from events where events.id = event_menu_submissions.event_id and is_venue_staff_for(events.venue_id))
  );

grant select on event_menu_submissions to authenticated;
grant all on event_menu_submissions to service_role;

create function public.check_guest_menu_count_membership()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from event_menu_templates emt
    join event_guests g on g.event_id = emt.event_id
    where g.id = new.guest_id and emt.menu_template_id = new.menu_template_id
  ) then
    raise exception 'menu is not one of the guest''s event menus' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger event_guest_menu_counts_membership
  before insert or update on event_guest_menu_counts
  for each row execute function public.check_guest_menu_count_membership();

create function public.delete_counts_for_unlinked_menu()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from event_guest_menu_counts
  where menu_template_id = old.menu_template_id
    and guest_id in (select id from event_guests where event_id = old.event_id);
  return null;
end;
$$;

create trigger event_menu_templates_unlink_counts
  after delete on event_menu_templates
  for each row execute function public.delete_counts_for_unlinked_menu();

revoke all on function public.check_guest_menu_count_membership() from public, anon, authenticated;
revoke all on function public.delete_counts_for_unlinked_menu() from public, anon, authenticated;

commit;
