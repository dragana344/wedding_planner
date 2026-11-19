-- 0181 (group B task 3): menu choices survive, numbers stay consistent.
--
-- 1. event_guests.no_meal_count: how many of a guest's children don't eat an
--    adult menu ("дете / без оброк"). A yes then splits as menu counts plus
--    no-meal children = party size. Children never outnumber the party and
--    no-meal children never outnumber the children — now checked here too
--    (existing rows are clamped first; the app always refused it, but the
--    couple's plain edit of the party size never looked at the children).
-- 2. event_guests.menu_rechoose_at: set when the venue changed the event's
--    menus (one taken off, or a second one added) and this confirmed guest's
--    split no longer fits — the couple is told "N гости треба повторно да
--    изберат мени". Only a hint: a guest counts while it is set and their
--    split still doesn't fit.
-- 3. event_rsvp_answers.no_meal_count: the same number, kept with each answer.
-- 4. menu_templates.archived_at: a package the venue "deleted" while events
--    use it is archived instead — it stays on those events (with the guests'
--    choices) and is no longer offered for new ones.
-- 5. event_menu_submissions.no_meal_count: "Деца без оброк: N" in the numbers
--    sent to the venue; insert_auto_menu_submission takes it too.
-- 6. event_seat_guest_flags(): seated guests' answer and party size for the
--    seating plan's flags ("Одбил — ослободете ги местата"), readable by the
--    venue's staff, who otherwise can't read the guest list.
-- 7. venue_menu_choice_pending(): per event, how many confirmed guests still
--    have to choose their menus — shown to the venue on the event.

begin;

update event_guests set children_count = party_size where children_count > party_size;

alter table event_guests
  add column no_meal_count int not null default 0,
  add column menu_rechoose_at timestamptz null,
  add constraint event_guests_children_within_party check (children_count <= party_size),
  add constraint event_guests_no_meal_within_children check (no_meal_count between 0 and children_count);

alter table event_rsvp_answers
  add column no_meal_count int not null default 0,
  add constraint event_rsvp_answers_no_meal_within_children check (no_meal_count between 0 and children_count);

alter table menu_templates
  add column archived_at timestamptz null;

alter table event_menu_submissions
  add column no_meal_count int not null default 0
    constraint event_menu_submissions_no_meal_nonnegative check (no_meal_count >= 0);

drop function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb);

create function public.insert_auto_menu_submission(
  p_event_id uuid,
  p_counts jsonb,
  p_titles jsonb,
  p_total int,
  p_unanswered int,
  p_allergy_notes jsonb,
  p_no_meal int default 0
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_inserted int;
begin
  insert into event_menu_submissions (event_id, sent_by, counts, menu_titles, total, source, unanswered, allergy_notes, no_meal_count)
  select p_event_id, 'Автоматски', p_counts, p_titles, p_total, 'auto', p_unanswered, p_allergy_notes, coalesce(p_no_meal, 0)
  where not exists (select 1 from event_menu_submissions where event_id = p_event_id);
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;
revoke all on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb, int) from public, anon, authenticated;
grant execute on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb, int) to service_role;

-- Seated guests of the event (any room) with their answer, party size and
-- how many seats they hold event-wide. Same reader rule as event_seat_list
-- (0071): the venue's staff or the service role.
create function public.event_seat_guest_flags(p_event_id uuid)
returns table (guest_id uuid, full_name text, rsvp_status text, party_size integer, seats_taken integer)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform assert_event_seating_reader(p_event_id);
  return query
    select g.id, g.full_name, g.rsvp_status, g.party_size, count(*)::int
    from event_seat_assignments s
    join event_guests g on g.id = s.guest_id
    where s.event_id = p_event_id
    group by g.id, g.full_name, g.rsvp_status, g.party_size;
end;
$$;
revoke all on function public.event_seat_guest_flags(uuid) from public, anon, authenticated;
grant execute on function public.event_seat_guest_flags(uuid) to authenticated, service_role;

-- Per event of the venue with 2+ menus: confirmed guests whose menu split
-- doesn't add up to their party (the same rule as isGuestDone in
-- lib/couple/guest-menus.ts; counts for unlinked menus are already gone, 0119).
create function public.venue_menu_choice_pending(p_venue_id uuid)
returns table (event_id uuid, guests integer)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not is_venue_staff_for(p_venue_id) then
    raise exception 'Not allowed to read this venue''s events.' using errcode = '42501';
  end if;
  return query
    select g.event_id, count(*)::int
    from event_guests g
    join events e on e.id = g.event_id
    where e.venue_id = p_venue_id
      and g.rsvp_status = 'confirmed'
      and (select count(*) from event_menu_templates emt where emt.event_id = g.event_id) >= 2
      and coalesce((select sum(c.count) from event_guest_menu_counts c where c.guest_id = g.id), 0) + g.no_meal_count <> g.party_size
    group by g.event_id;
end;
$$;
revoke all on function public.venue_menu_choice_pending(uuid) from public, anon, authenticated;
grant execute on function public.venue_menu_choice_pending(uuid) to authenticated, service_role;

commit;
