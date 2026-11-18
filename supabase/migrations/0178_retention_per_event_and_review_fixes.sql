-- 0178 (group A, final-review fixes).
--
-- 1. The retention sweep runs one erasure per call. purge_expired_event_data
--    (0170/0176) erased every due event in one transaction, under the API's
--    statement timeout: one slow or failing event stopped them all.
--    lib/privacy/retention.ts now lists the due events
--    (due_retention_event_ids), erases each with its own
--    erase_event_personal_data call, then calls purge_old_contact_submissions
--    and purge_closed_support_tickets. Same rules, same audit rows. The old
--    function is dropped.
--
-- 2. erase_event_personal_data (0171 body) also clears reservations.note of
--    the event's reservation, on every reason: it is free text the venue
--    typed about the booking.
--
-- 3. Reservations: staff no longer delete rows from the browser (the grant
--    from 0016 let any staff member hard-delete any booking of their venue,
--    past the audited "Избриши засекогаш" route). The booking form's
--    clean-up after a failed table claim uses discard_unbooked_reservation.
--    A guard keeps a mini event's reservation in step with its event: its
--    status can be 'cancelled' only while the event is cancelled, and it
--    can't be re-linked to another event.
--
-- 4. auth_user_deletion_retries: staff Auth users whose deletion failed
--    after their venue was deleted (lib/privacy/erase.ts), retried by the
--    daily cron.

begin;

-- 1. Retention sweep, in pieces ----------------------------------------------

-- The events whose couple access has ended (effective end before today,
-- Skopje date) and are not erased yet — the rule from 0170.
create or replace function public.due_retention_event_ids(p_limit int default 500)
returns setof uuid
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select id from events
  where personal_data_erased_at is null
    and coalesce(couple_access_extended_until, couple_access_until, (event_date + interval '6 months')::date) < (now() at time zone 'Europe/Skopje')::date
  order by event_date, id
  limit p_limit;
$$;
revoke all on function public.due_retention_event_ids(int) from public, anon, authenticated;
grant execute on function public.due_retention_event_ids(int) to service_role;

-- Contact-form messages older than 6 months (0170).
create or replace function public.purge_old_contact_submissions()
returns int
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_count int;
begin
  delete from contact_submissions
  where created_at < now() - interval '6 months';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into audit_log (actor_type, action, details)
    values ('system', 'contact_submissions_purged', jsonb_build_object('count', v_count, 'months', 6));
  end if;
  return v_count;
end;
$$;
revoke all on function public.purge_old_contact_submissions() from public, anon, authenticated;
grant execute on function public.purge_old_contact_submissions() to service_role;

-- Support tickets closed more than 6 months ago, with their threads (0176).
create or replace function public.purge_closed_support_tickets()
returns int
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_count int;
begin
  delete from support_tickets
  where status = 'done' and resolved_at < now() - interval '6 months';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into audit_log (actor_type, action, details)
    values ('system', 'support_tickets_purged', jsonb_build_object('count', v_count, 'months', 6));
  end if;
  return v_count;
end;
$$;
revoke all on function public.purge_closed_support_tickets() from public, anon, authenticated;
grant execute on function public.purge_closed_support_tickets() to service_role;

drop function public.purge_expired_event_data();

-- 2. erase_event_personal_data: reservations.note ----------------------------

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
    -- changed (0178): the booking's free-text note goes too
    update reservations set email = null, note = null where event_id = p_event_id and (email is not null or note is not null);
  else
    -- changed (0178): the note too
    update reservations set guest_name = 'Избришани податоци', phone = '', email = null, note = null
    where event_id = p_event_id and (guest_name <> 'Избришани податоци' or note is not null);
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

-- 3. Reservations ------------------------------------------------------------

revoke delete on public.reservations from anon, authenticated;

-- createReservation (lib/venue/reservations.ts) inserts the booking, then its
-- tables; when the tables insert fails (another booking took one) it removes
-- the row it just made. Only that: a booking of the caller's venue, made in
-- the last few minutes, not a mini event's, with no tables attached.
create or replace function public.discard_unbooked_reservation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  delete from reservations r
  where r.id = p_reservation_id
    and r.event_id is null
    and r.created_at > now() - interval '5 minutes'
    and (coalesce(auth.role(), '') = 'service_role' or is_venue_staff_for(r.venue_id))
    and not exists (select 1 from reservation_tables t where t.reservation_id = r.id)
  returning r.id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.discard_unbooked_reservation(uuid) from public, anon;
grant execute on function public.discard_unbooked_reservation(uuid) to authenticated, service_role;

-- A mini event's reservation follows its event (0174's
-- events_sync_mini_reservation and set_reservation_status do it in that
-- order). Any other write — e.g. a status change from the browser — must
-- not leave a cancelled booking on a live event, or a live booking on a
-- cancelled one. Seated/completed stay free (the day list sets them).
create or replace function public.reservations_guard_mini_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_status text;
begin
  if new.event_id is distinct from old.event_id then
    raise exception 'A reservation cannot be moved to another event.' using errcode = '42501';
  end if;
  if new.event_id is not null and new.status is distinct from old.status then
    select status into v_event_status from events where id = new.event_id;
    if (new.status = 'cancelled') <> (v_event_status = 'cancelled') then
      raise exception 'A mini event''s reservation follows its event: cancel or restore the event itself.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.reservations_guard_mini_event() from public, anon, authenticated;

create trigger reservations_guard_mini_event
  before update on public.reservations
  for each row execute function public.reservations_guard_mini_event();

-- 4. Auth users left after a venue deletion ----------------------------------

-- Written by finishVenueDeletion when auth.admin.deleteUser fails; the
-- daily cron retries each row and removes it once the user is gone. The
-- venue itself is already deleted (venue_id is no foreign key).
create table public.auth_user_deletion_retries (
  user_id uuid primary key,
  venue_id uuid,
  attempts int not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now()
);
alter table public.auth_user_deletion_retries enable row level security;
revoke all on public.auth_user_deletion_retries from anon, authenticated;
grant all on public.auth_user_deletion_retries to service_role;

commit;
