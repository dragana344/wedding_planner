-- 0117: the couple's contact details and each event's money are manager/
-- owner only. Клиенти was already gated, but Настани sent the same contacts,
-- prices and deposits to every staff member, and RLS ("venue staff reads own
-- events", 0096) let any staff session read them straight from the table.
--
-- Staff keep reading every other column of their venue's events. The five
-- columns below are read only server-side with the service-role client,
-- behind a manager-elevation check (/api/venue/events/private,
-- /api/venue/clients, /api/venue/reports) — the routes that write them
-- (contact, finance, event create) already use the service role too.
--
-- Column-level grants: a column added to `events` later is NOT readable by
-- staff until it is added to the grant below — deliberately fail-closed.

begin;

revoke select on events from authenticated;
grant select (
  id, venue_id, couple_names, event_date, guest_count_estimate, menu_template_id, created_at,
  layout_undo_snapshot, start_time, end_time, status, event_type,
  seating_draft, seating_draft_undo, seating_confirmed_at, checklist_seeded_at, personal_data_erased_at,
  seating_history, layout_history, seating_rev, seating_unseen_at
) on events to authenticated;

commit;
