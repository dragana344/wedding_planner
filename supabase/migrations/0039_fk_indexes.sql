-- 0039 (DATA-004): index every foreign key the app filters or joins on that
-- had none, so deletes (FK checks on cascade) and per-venue/per-room lookups
-- stay index scans as data grows. event_id/venue_id/room_id on the hot
-- event_* and room tables were already indexed.
create index if not exists venue_staff_venue_id_idx on public.venue_staff (venue_id);
create index if not exists events_menu_template_id_idx on public.events (menu_template_id);
create index if not exists event_rooms_room_id_idx on public.event_rooms (room_id);
create index if not exists room_layout_elements_table_type_id_idx on public.room_layout_elements (table_type_id);
create index if not exists event_layout_elements_table_type_id_idx on public.event_layout_elements (table_type_id);
create index if not exists event_custom_menu_items_menu_item_id_idx on public.event_custom_menu_items (menu_item_id);
create index if not exists event_menu_item_quantities_menu_item_id_idx on public.event_menu_item_quantities (menu_item_id);

-- Nightly purge of expired couple sessions (0032).
create index if not exists couple_sessions_expires_at_idx on public.couple_sessions (expires_at);
