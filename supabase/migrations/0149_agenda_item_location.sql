-- supabase/migrations/0149_agenda_item_location.sql
-- Lets each agenda item carry where it happens (church, restaurant, hall
-- name...) alongside its time and title. Nullable: not every item needs one.

alter table event_agenda_items
  add column location text;
