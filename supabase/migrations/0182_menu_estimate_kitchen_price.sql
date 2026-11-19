-- Group B, task B4: menu numbers with an estimate, changes after sending,
-- contracted vs final price.
--
-- 1. event_menu_submissions.estimated_counts / estimated_total: when the
--    couple (or the automatic send) sends before every guest answered, the
--    unanswered part is estimated per menu and stored apart from the real
--    counts, so every screen can mark it ("од кои проценка: 24"). 0 / null
--    when everyone answered. `unanswered` (0125) now also holds the couple's
--    own sends with an estimate.
-- 2. event_menu_submissions.allergy_key: a keyed fingerprint (HMAC, never the
--    text) of the allergy notes at the time of sending, so a later change to
--    a guest's allergies can be flagged to the venue even when the couple
--    sent a summary instead of the raw notes.
-- 3. event_changes / event_change_seen: a new section 'numbers' — "Промена
--    по испратените бројки", a couple-side change mark the venue confirms
--    with Видено, written by lib/couple/numbers-changes.ts (counts and menu
--    names only; no guest names, no allergy text).
-- 4. insert_auto_menu_submission takes the estimate and the allergy key.
-- 5. events.price_per_guest / contracted_guests: what the venue agreed when
--    it priced the event with the per-guest calculator (total_price stays the
--    agreed total). Private like total_price: not in 0117's staff column
--    grant, read and written with the service role behind manager elevation.

begin;

alter table event_menu_submissions
  add column estimated_counts jsonb null,
  add column estimated_total int not null default 0
    constraint event_menu_submissions_estimated_total_nonnegative check (estimated_total >= 0),
  add column allergy_key text null;

alter table event_changes drop constraint event_changes_section_check;
alter table event_changes add constraint event_changes_section_check
  check (section in ('date_time', 'rooms', 'menus', 'guest_count', 'contact', 'finance', 'numbers'));

alter table event_change_seen drop constraint event_change_seen_section_check;
alter table event_change_seen add constraint event_change_seen_section_check
  check (section in ('date_time', 'rooms', 'menus', 'guest_count', 'contact', 'finance', 'menu_numbers', 'guest_replies', 'numbers'));

alter table events
  add column price_per_guest numeric(12, 2) null
    constraint events_price_per_guest_range check (price_per_guest is null or (price_per_guest >= 0 and price_per_guest <= 1000000000)),
  add column contracted_guests int null
    constraint events_contracted_guests_range check (contracted_guests is null or (contracted_guests >= 0 and contracted_guests <= 100000));

drop function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb, int);

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
  p_allergy_key text default null
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
    estimated_counts, estimated_total, allergy_key
  )
  select p_event_id, 'Автоматски', p_counts, p_titles, p_total, 'auto', p_unanswered, p_allergy_notes, coalesce(p_no_meal, 0),
    p_estimated_counts, coalesce(p_estimated_total, 0), p_allergy_key
  where not exists (select 1 from event_menu_submissions where event_id = p_event_id);
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;
revoke all on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb, int, jsonb, int, text) from public, anon, authenticated;
grant execute on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb, int, jsonb, int, text) to service_role;

commit;
