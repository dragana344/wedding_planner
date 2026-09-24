-- Lets an organizer freely experiment with an event's seating without staff
-- seeing every in-progress change. Previously the couple's seating editor
-- edited event_layout_elements directly — the same rows staff read/edit —
-- so every drag was immediately visible to staff. Now the organizer edits a
-- private draft instead; "confirm" copies that draft over
-- event_layout_elements so staff see the finished choice. Staff's own
-- edit access to event_layout_elements is unchanged.
--
-- Stored as jsonb keyed by room_id (an event can span more than one room),
-- mirroring the existing layout_undo_snapshot column's convention. All reads
-- and writes go through the couple's service-role-backed API routes (see
-- lib/couple/seating.ts), the same trust boundary layout_undo_snapshot
-- already relies on — no new RLS policy is needed.
alter table events add column seating_draft jsonb not null default '{}'::jsonb;
alter table events add column seating_draft_undo jsonb not null default '{}'::jsonb;
alter table events add column seating_confirmed_at jsonb not null default '{}'::jsonb;
