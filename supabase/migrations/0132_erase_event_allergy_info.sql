-- 0132: event erasure (0122, extended by 0125) already cleared the manager's
-- name off a menu submission but left the newer allergy_summary/allergy_notes
-- columns (0131) untouched — both name guests and can carry health data, so
-- they must go too. The numeric counts stay, same as before.

begin;

create or replace function public.erase_event_personal_data(
  p_event_id uuid,
  p_actor_id uuid default null,
  p_reason text default 'request',
  p_request_id text default null
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

  insert into audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, request_id, details)
  values (
    case when p_actor_id is null then 'system' else 'staff' end,
    p_actor_id, 'event_personal_data_erased', v_venue_id, p_event_id, p_event_id, p_request_id,
    jsonb_build_object('reason', p_reason)
  );
  return true;
end;
$$;

commit;
