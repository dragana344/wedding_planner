-- 0116: the "everyday" tier (the venue's own day-to-day restaurant menu,
-- separate from what it serves at events) never ended up mattering here —
-- this app is event-only, so every dish a venue adds is for events. Drop it
-- as an option: every existing row collapses to its one remaining tag,
-- 'special' (shown to staff simply as "Мени" from here on — see
-- MenusClient.tsx), and the constraint no longer allows anything else.

begin;

update menu_items set tiers = array['special'] where tiers <> array['special'];

alter table menu_items drop constraint menu_items_tiers_valid;
alter table menu_items add constraint menu_items_tiers_valid check (tiers = array['special']);

commit;
