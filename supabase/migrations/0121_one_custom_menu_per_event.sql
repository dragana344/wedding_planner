-- One custom (event-only) menu per event, enforced by the database so two
-- concurrent first saves cannot both create one. Replaces 0119's plain index.
begin;
drop index if exists menu_templates_event_id_idx;
create unique index menu_templates_event_id_key on menu_templates (event_id) where event_id is not null;
commit;
