-- 0156: the couple's "Локации" page is folded into "Агенда". Each agenda item
-- keeps its place name in `location` (0022) and now also carries the place's
-- address and map link, the two fields event_locations had.
--
-- Existing event_locations rows move over so nothing is lost:
--   * a location whose name matches an agenda item's place name (ignoring
--     case and spaces) gives its address and map link to that item;
--   * a location that matches no item becomes a new agenda item without a
--     time (title and place = its name), listed after the existing items.
-- The event_locations table itself stays, untouched, as a backup; the app no
-- longer reads or writes it.

alter table public.event_agenda_items add column address text;
alter table public.event_agenda_items add column map_url text;
alter table public.event_agenda_items add constraint event_agenda_items_address_len check (address is null or char_length(address) <= 1000);
alter table public.event_agenda_items add constraint event_agenda_items_map_url_len check (map_url is null or char_length(map_url) <= 2048);

-- 1. Matching locations: address and map link go onto every item that names the place.
update public.event_agenda_items a
set address = coalesce(a.address, l.address),
    map_url = coalesce(a.map_url, l.map_url)
from public.event_locations l
where l.event_id = a.event_id
  and a.location is not null
  and lower(btrim(a.location)) = lower(btrim(l.label));

-- 2. Locations no item names: a new agenda item each, after the existing ones.
insert into public.event_agenda_items (event_id, time, title, location, address, map_url, sort_order)
select l.event_id,
       null,
       l.label,
       l.label,
       l.address,
       l.map_url,
       coalesce((select max(a.sort_order) from public.event_agenda_items a where a.event_id = l.event_id), -1)
         + row_number() over (partition by l.event_id order by l.sort_order, l.created_at, l.id)
from public.event_locations l
where not exists (
  select 1 from public.event_agenda_items a
  where a.event_id = l.event_id and a.location is not null and lower(btrim(a.location)) = lower(btrim(l.label))
);
