-- 0180 (group B task 2): the RSVP deadline, set by the venue, and the
-- invitation's small guest-facing fixes.
--
-- 1. venues.rsvp_deadline_days: the venue-wide default — guests can answer
--    until this many days before the event (15, the same day the final menu
--    numbers go automatically, lib/menu-timeline.ts).
-- 2. events.rsvp_deadline: a per-event date that replaces the default; null
--    follows the venue. The effective deadline is
--    coalesce(rsvp_deadline, event_date - rsvp_deadline_days) — see
--    lib/rsvp-deadline.ts. The deadline day itself is still open.
-- 3. event_rsvp_answers.review_reason: why an answer waits for the couple
--    besides an unsure match. 'guest_limit': the package's guest limit was
--    reached, so no guest could be created for it.
-- 4. event_greetings.rsvp_answer_id: a greeting sent right after an answer
--    that went to "Да се провери" belongs to that answer until the couple
--    says whose it is; then it moves to that guest (if the guest has none
--    yet — one per guest stays the rule). One per answer.
--    The last-name check no longer depends on guest_id: since 0151 it made
--    deleting a guest (or erasing the event) fail whenever that guest's
--    greeting had a one-word name — the `on delete set null` broke the
--    check. Two names are still required on the album's QR form, in the
--    app (lib/media/greetings.ts), as they always were.

begin;

alter table public.venues
  add column rsvp_deadline_days int not null default 15
    constraint venues_rsvp_deadline_days_range check (rsvp_deadline_days between 0 and 365);

alter table public.events
  add column rsvp_deadline date null;

-- 0117: staff read events column by column (fail-closed for new columns).
grant select (rsvp_deadline) on events to authenticated;

alter table public.event_rsvp_answers
  add column review_reason text null
    constraint event_rsvp_answers_review_reason_check check (review_reason in ('guest_limit'));

alter table public.event_greetings
  add column rsvp_answer_id uuid null references public.event_rsvp_answers(id) on delete set null;
create unique index event_greetings_rsvp_answer_idx on public.event_greetings (rsvp_answer_id) where rsvp_answer_id is not null;

alter table public.event_greetings drop constraint event_greetings_last_name_check;
alter table public.event_greetings add constraint event_greetings_last_name_check check (char_length(btrim(last_name)) <= 60);

commit;
