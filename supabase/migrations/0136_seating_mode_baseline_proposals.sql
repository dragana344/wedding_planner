-- 0136: Project A, spec §1/§3/§4/§5/§7.
--
-- §1: every event picks a seating_mode at creation ('full' claims the whole
-- room; 'mini' is Project B, not built yet). Existing events are 'full' —
-- matches how every one of them already behaves.
-- §3: seating_baseline is captured once, at creation, for 'full' events —
-- what the couple's "reset to baseline" button restores their draft to.
-- §4: the self-editing toggle, two levels (owner-wide, then per-event).
-- §5: event_seating_proposals is the new send/approve/reject/counter table.
-- §7: seating_unseen_at is dropped — replaced by §5's notifications, which
-- say who sent what and when instead of a single boolean dot. Its only two
-- call sites (lib/venue/events.ts, lib/couple/seating.ts) are updated in
-- this same change.

begin;

-- Keeps a DB-level default of 'full', even though spec §1 wants every new
-- event to choose explicitly: the event-creation wizard enforces that
-- choice at the UI layer, but hundreds of existing direct `events` inserts
-- across this codebase and its test suite (admin tooling, fixtures, data
-- migrations) don't go through create_event_full at all, and a NOT NULL
-- column with no default breaks every one of them (confirmed — tried the
-- no-default version first; 221 unrelated tests failed).
alter table public.events add column seating_mode text not null default 'full' check (seating_mode in ('full', 'mini'));

alter table public.events add column seating_baseline jsonb;
alter table public.events add column seating_self_edit_enabled boolean;

alter table public.venues add column couple_seating_self_edit_enabled boolean not null default true;

create table public.event_seating_proposals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  proposed_by text not null check (proposed_by in ('venue', 'couple')),
  snapshot jsonb not null check (octet_length(snapshot::text) <= 1500000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'superseded')),
  note text check (note is null or char_length(note) <= 2000),
  created_by text check (created_by is null or char_length(created_by) <= 100),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by text check (responded_by is null or char_length(responded_by) <= 100)
);

create index event_seating_proposals_event_id_idx on public.event_seating_proposals(event_id);
create index event_seating_proposals_room_id_idx on public.event_seating_proposals(room_id);
create index event_seating_proposals_status_idx on public.event_seating_proposals(event_id, room_id, status) where status = 'pending';

-- Service-role only, like event_changes/audit_log: sending/approving needs
-- a server-side manager-elevation check (venue side) and a couple-session
-- cookie check (couple side) before either touches this table — neither is
-- expressible as an RLS policy, so both go through API routes using the
-- service-role client instead of direct browser access.
alter table public.event_seating_proposals enable row level security;
revoke all on public.event_seating_proposals from anon, authenticated;
grant all on public.event_seating_proposals to service_role;

alter table public.events drop column seating_unseen_at;

-- 0117's staff select-grant is an explicit column list (fail-closed by
-- design: "a column added to events later is NOT readable by staff until
-- it is added here"). seating_unseen_at just got dropped and seating_mode/
-- seating_baseline/seating_self_edit_enabled are brand new — all plain
-- venue config, not manager-only — so re-grant with the updated list.
revoke select on public.events from authenticated;
grant select (
  id, venue_id, couple_names, event_date, guest_count_estimate, created_at,
  layout_undo_snapshot, start_time, end_time, status, event_type,
  seating_draft, seating_draft_undo, seating_confirmed_at, checklist_seeded_at, personal_data_erased_at,
  seating_history, layout_history, seating_rev,
  seating_mode, seating_baseline, seating_self_edit_enabled
) on public.events to authenticated;

-- erase_event_personal_data (same signature as 0133 — a plain create or
-- replace): event_seating_proposals.snapshot can carry a guest-naming table
-- label, same reasoning as event_layout_elements.label just above it, and
-- created_by/responded_by are manager names — deleted outright (like
-- event_notes etc. just above), rather than kept-with-fields-nulled like
-- event_changes, since a negotiation record for an erased event has no
-- ongoing purpose.
create or replace function public.erase_event_personal_data(
  p_event_id uuid,
  p_actor_id uuid default null,
  p_reason text default 'request',
  p_request_id text default null,
  p_manager_name text default null
)
returns boolean
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue_id uuid;
begin
  perform set_config('app.change_side', 'erase', true);

  select venue_id into v_venue_id from events where id = p_event_id for update;
  if v_venue_id is null then
    return false;
  end if;

  -- Couple access: login and every live session.
  delete from couple_sessions where event_id = p_event_id;
  delete from event_credentials where event_id = p_event_id;

  -- Guests and the couple's planning tools.
  delete from event_guests where event_id = p_event_id;
  delete from event_notes where event_id = p_event_id;
  delete from event_agenda_items where event_id = p_event_id;
  delete from event_locations where event_id = p_event_id;
  delete from event_budget_items where event_id = p_event_id;
  delete from event_checklist_items where event_id = p_event_id; -- subtasks cascade
  delete from event_seating_proposals where event_id = p_event_id;
  -- Guests' menu counts (0119) cascade with event_guests. The menu numbers
  -- sent to the venue stay (counts only); the manager's name and the
  -- allergy summary/raw guest notes (0131 — both can name guests or carry
  -- health data) are cleared.
  update event_menu_submissions
  set seen_by = null, allergy_summary = null, allergy_notes = null
  where event_id = p_event_id and (seen_by is not null or allergy_summary is not null or allergy_notes is not null);

  -- Change marks (0125): the log stays (it is the event's history), minus
  -- contact values and names.
  update event_changes set old_value = null, new_value = null where event_id = p_event_id and section = 'contact';
  update event_changes set changed_by = null where event_id = p_event_id and changed_by is not null;
  update event_change_seen set seen_by = null where event_id = p_event_id and seen_by is not null;
  delete from event_couple_reminders where event_id = p_event_id;

  -- Rows pointing at photos: the 0038 triggers queue their files.
  delete from event_invitations where event_id = p_event_id;
  delete from event_showcase_photos where event_id = p_event_id;

  -- Table labels may name guests ("Table 3 - Petrovski family"). The tables
  -- themselves stay, so the room plan and reservations are unaffected.
  update event_layout_elements set label = null where event_id = p_event_id and label is not null;

  update events
  set couple_names = 'Избришани податоци',
      contact_email = null,
      contact_email_2 = null,
      contact_phone = null,
      seating_draft = '{}'::jsonb,
      seating_draft_undo = '{}'::jsonb,
      layout_undo_snapshot = null,
      personal_data_erased_at = now()
  where id = p_event_id;

  -- Files no row points at any more (e.g. replaced invitation photos).
  insert into storage_cleanup_queue (bucket, path)
  select o.bucket_id, o.name
  from storage.objects o
  where ((o.bucket_id = 'invitation-photos' and o.name like p_event_id::text || '-%')
      or (o.bucket_id = 'event-showcase-photos' and o.name like v_venue_id::text || '/' || p_event_id::text || '-%'))
    and not exists (select 1 from storage_cleanup_queue q where q.bucket = o.bucket_id and q.path = o.name);

  insert into audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, request_id, details, manager_name)
  values (
    case when p_actor_id is null then 'system' else 'staff' end,
    p_actor_id, 'event_personal_data_erased', v_venue_id, p_event_id, p_event_id, p_request_id,
    jsonb_build_object('reason', p_reason), p_manager_name
  );
  return true;
end;
$$;

commit;
