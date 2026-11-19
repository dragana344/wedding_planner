-- Group B final-review fixes (2026-11-19).
--
-- 1. apply_rsvp_answer: one transaction for "apply an answer to a guest":
--    (optionally) create the guest, write the answer fields and the menu
--    split, take the before/after snapshots, and store or resolve the answer
--    row. A failure anywhere (a menu the event no longer has, the package's
--    guest limit, an answer resolved twice) leaves nothing behind — no blank
--    guest, no half-written status, no answer stuck between states. Plain
--    (security invoker) and service_role only: the app calls it with the
--    service-role client after its own checks, like the rest of the guest
--    list.
-- 2. event_rsvp_answers:
--    * review_state 'linked': the couple tied a pending answer to a guest who
--      already has a newer answer, without changing the guest's numbers
--      ("Само поврзи").
--    * status may also be 'invited' / 'pending': the couple's own status
--      changes are recorded too (decision 8), and their quick status toggle
--      can set those.
--    * guest_id now cascades: deleting a guest deletes their answers (they
--      held the guest's personal data with nothing left to show it on).
--      Pending answers never applied to a guest have no guest_id and stay
--      until resolved or the event is erased.
-- 3. event_menu_submissions.estimated_people: how many people were still
--    without an answer when a sending carried an estimate — so later answers
--    from that group shrink the estimate instead of being flagged to the
--    venue as new people (numbers-changes.ts). A count, no personal data.

begin;

alter table public.event_rsvp_answers drop constraint event_rsvp_answers_review_state_check;
alter table public.event_rsvp_answers add constraint event_rsvp_answers_review_state_check
  check (review_state in ('none', 'pending', 'applied', 'ignored', 'linked'));

alter table public.event_rsvp_answers drop constraint event_rsvp_answers_status_check;
alter table public.event_rsvp_answers add constraint event_rsvp_answers_status_check
  check (status in ('confirmed', 'declined', 'later', 'invited', 'pending'));

alter table public.event_rsvp_answers drop constraint event_rsvp_answers_guest_id_fkey;
alter table public.event_rsvp_answers add constraint event_rsvp_answers_guest_id_fkey
  foreign key (guest_id) references public.event_guests(id) on delete cascade;

alter table public.event_menu_submissions
  add column estimated_people int null
    constraint event_menu_submissions_estimated_people_nonnegative check (estimated_people is null or estimated_people >= 0);

-- The automatic send stores the estimated people too.
drop function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb, int, jsonb, int, text);

create function public.insert_auto_menu_submission(
  p_event_id uuid,
  p_counts jsonb,
  p_titles jsonb,
  p_total int,
  p_unanswered int,
  p_allergy_notes jsonb,
  p_no_meal int default 0,
  p_estimated_counts jsonb default null,
  p_estimated_total int default 0,
  p_allergy_key text default null,
  p_estimated_people int default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_inserted int;
begin
  insert into event_menu_submissions (
    event_id, sent_by, counts, menu_titles, total, source, unanswered, allergy_notes, no_meal_count,
    estimated_counts, estimated_total, allergy_key, estimated_people
  )
  select p_event_id, 'Автоматски', p_counts, p_titles, p_total, 'auto', p_unanswered, p_allergy_notes, coalesce(p_no_meal, 0),
    p_estimated_counts, coalesce(p_estimated_total, 0), p_allergy_key, p_estimated_people
  where not exists (select 1 from event_menu_submissions where event_id = p_event_id);
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;
revoke all on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb, int, jsonb, int, text, int) from public, anon, authenticated;
grant execute on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb, int, jsonb, int, text, int) to service_role;

-- A guest's answer fields at this moment, the shape event_rsvp_answers.before/after hold.
create function public.rsvp_guest_snapshot(p_guest_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status', g.rsvp_status,
    'party_size', g.party_size,
    'children_count', g.children_count,
    'menu_counts', coalesce((select jsonb_object_agg(c.menu_template_id, c.count) from event_guest_menu_counts c where c.guest_id = g.id), '{}'::jsonb),
    'no_meal_count', g.no_meal_count,
    'allergies', g.allergies,
    'household_names', to_jsonb(g.household_names)
  )
  from event_guests g
  where g.id = p_guest_id;
$$;
revoke all on function public.rsvp_guest_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.rsvp_guest_snapshot(uuid) to service_role;

-- Errors the app maps to its own messages:
--   RA001  the pending answer was already resolved (or is not this event's)
--   RA002  the guest is not this event's
create function public.apply_rsvp_answer(
  p_event_id uuid,
  p_guest_id uuid,           -- null: a new guest named p_new_name
  p_new_name text,
  p_answer jsonb,            -- {status, party_size, children_count, no_meal_count, menu_counts, allergies, comment, household_names}
  p_via_link boolean,
  p_phone text default null, -- shared link: fills an empty guest phone
  p_rechoose boolean default false, -- the answer's menus no longer fit: ask the guest to choose again
  p_record jsonb default null,      -- store a new answer row: {source, full_name (null: the guest's), phone, match}
  p_resolve_id uuid default null,   -- or resolve this pending answer row
  p_resolved_by text default null,
  p_link_only boolean default false -- resolve without touching the guest ("Само поврзи")
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_guest_id uuid := p_guest_id;
  v_fresh boolean := p_guest_id is null;
  v_status text := p_answer->>'status';
  v_old_status text;
  v_before jsonb;
  v_after jsonb;
  v_answer_id uuid;
  v_state text;
  v_name text;
  v_phone text := left(nullif(btrim(coalesce(p_phone, '')), ''), 50);
begin
  if p_resolve_id is not null then
    -- Claimed under a row lock: two taps at once resolve it once.
    select review_state into v_state from event_rsvp_answers where id = p_resolve_id and event_id = p_event_id for update;
    if v_state is distinct from 'pending' then
      raise exception 'rsvp answer already resolved' using errcode = 'RA001';
    end if;
  end if;

  if v_fresh then
    -- The package's guest limit trigger may refuse it (P0001): nothing is kept then.
    insert into event_guests (event_id, full_name) values (p_event_id, btrim(p_new_name)) returning id into v_guest_id;
  else
    select rsvp_status into v_old_status from event_guests where id = v_guest_id and event_id = p_event_id for update;
    if not found then
      raise exception 'guest not in event' using errcode = 'RA002';
    end if;
    v_before := rsvp_guest_snapshot(v_guest_id);
  end if;

  if not p_link_only then
    if v_status = 'confirmed' then
      -- The old split goes first (it may not fit the new party), then the new one.
      delete from event_guest_menu_counts where guest_id = v_guest_id;
      update event_guests
      set rsvp_status = v_status,
          rsvp_comment = p_answer->>'comment',
          party_size = (p_answer->>'party_size')::int,
          children_count = coalesce((p_answer->>'children_count')::int, 0),
          no_meal_count = coalesce((p_answer->>'no_meal_count')::int, 0),
          allergies = p_answer->>'allergies',
          household_names = coalesce(array(select jsonb_array_elements_text(coalesce(p_answer->'household_names', '[]'::jsonb))), '{}'),
          menu_rechoose_at = case when p_rechoose then now() else menu_rechoose_at end
      where id = v_guest_id;
      insert into event_guest_menu_counts (guest_id, menu_template_id, count)
      select v_guest_id, e.key::uuid, e.value::int
      from jsonb_each_text(coalesce(p_answer->'menu_counts', '{}'::jsonb)) e
      where e.value::int > 0;
    else
      -- A "no" or "later" keeps the party details and the menu choice (0181).
      update event_guests set rsvp_status = v_status, rsvp_comment = p_answer->>'comment' where id = v_guest_id;
    end if;

    if p_via_link then
      update event_guests
      set rsvp_changed_via_link_at = now(),
          rsvp_previous_status = case when v_fresh then null else v_old_status end
      where id = v_guest_id;
    end if;
    if v_phone is not null then
      update event_guests set phone = v_phone where id = v_guest_id and coalesce(phone, '') = '';
    end if;
  end if;

  v_after := rsvp_guest_snapshot(v_guest_id);

  if p_resolve_id is not null then
    update event_rsvp_answers
    set review_state = case when p_link_only then 'linked' else 'applied' end,
        resolved_at = now(),
        resolved_by = p_resolved_by,
        guest_id = v_guest_id,
        before = v_before,
        after = v_after
    where id = p_resolve_id;
    v_answer_id := p_resolve_id;
  elsif p_record is not null then
    select full_name into v_name from event_guests where id = v_guest_id;
    insert into event_rsvp_answers (
      event_id, guest_id, source, full_name, phone, status, party_size, children_count, menu_counts, no_meal_count,
      allergies, comment, household_names, match, review_state, before, after
    )
    values (
      p_event_id, v_guest_id, p_record->>'source', left(coalesce(nullif(btrim(p_record->>'full_name'), ''), v_name), 200),
      left(nullif(btrim(coalesce(p_record->>'phone', '')), ''), 50),
      v_status, (p_answer->>'party_size')::int, coalesce((p_answer->>'children_count')::int, 0),
      coalesce(p_answer->'menu_counts', '{}'::jsonb), coalesce((p_answer->>'no_meal_count')::int, 0),
      p_answer->>'allergies', p_answer->>'comment',
      coalesce(array(select jsonb_array_elements_text(coalesce(p_answer->'household_names', '[]'::jsonb))), '{}'),
      p_record->>'match', 'none', v_before, v_after
    )
    returning id into v_answer_id;
  end if;

  return jsonb_build_object(
    'guest_id', v_guest_id,
    'answer_id', v_answer_id,
    'guest_name', (select full_name from event_guests where id = v_guest_id),
    'before', v_before,
    'after', v_after
  );
end;
$$;
revoke all on function public.apply_rsvp_answer(uuid, uuid, text, jsonb, boolean, text, boolean, jsonb, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.apply_rsvp_answer(uuid, uuid, text, jsonb, boolean, text, boolean, jsonb, uuid, text, boolean) to service_role;

commit;
