-- 0171: erase_event_personal_data also deletes the couple's support tickets
-- (group A, task 2). A ticket the couple sent names them and describes their
-- problem in free text, so it is the event's personal data like the rest; it
-- goes on every erasure reason (retention and request alike).
--
-- Body copied from 0170; the only change is the support_tickets delete.

begin;

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
  v_keep_organizer boolean := p_reason = 'retention';
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

  -- Support tickets the couple sent from their dashboard (0089: event_id is
  -- set only for those; a venue's own tickets have none). The thread
  -- (support_ticket_messages, 0150) cascades; tickets carry no files.
  delete from support_tickets where event_id = p_event_id;

  -- Rows pointing at photos: the 0038 triggers queue their files.
  delete from event_invitations where event_id = p_event_id;
  delete from event_showcase_photos where event_id = p_event_id;

  -- Table labels may name guests ("Table 3 - Petrovski family"). The tables
  -- themselves stay, so the room plan and reservations are unaffected.
  update event_layout_elements set label = null where event_id = p_event_id and label is not null;

  -- Project B §1: the mini-event's own table claim, if any. phone is
  -- not-null on reservations (unlike events.contact_phone), so it gets the
  -- same placeholder as the name rather than null. On retention the
  -- organizer's name/phone stay (the venue's booking record); email goes.
  if v_keep_organizer then
    update reservations set email = null where event_id = p_event_id and email is not null;
  else
    update reservations set guest_name = 'Избришани податоци', phone = '', email = null
    where event_id = p_event_id and guest_name <> 'Избришани податоци';
  end if;

  update events
  set couple_names = case when v_keep_organizer then couple_names else 'Избришани податоци' end,
      contact_email = case when v_keep_organizer then contact_email end,
      contact_email_2 = case when v_keep_organizer then contact_email_2 end,
      contact_phone = case when v_keep_organizer then contact_phone end,
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
