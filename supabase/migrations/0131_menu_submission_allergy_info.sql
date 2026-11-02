-- 0131: a guest's RSVP already has a free-text allergies note (0060); this
-- adds a place to carry it through to the venue with each menu-numbers
-- sending. Strict either/or, decided with the user: if the couple wrote
-- their own summary, the venue sees only that (allergy_summary) — no
-- competing raw list that could disagree with it. If they left it blank
-- (including every automatic cron send, which by definition has no couple
-- summary), the venue instead gets the raw per-guest notes grouped by the
-- menu each guest chose (allergy_notes), computed by the app from
-- event_guests.allergies + event_guest_menu_counts — nothing here parses or
-- combines the free text itself, only groups it by menu.

begin;

alter table event_menu_submissions
  add column allergy_summary text,
  add column allergy_notes jsonb;
alter table event_menu_submissions
  add constraint event_menu_submissions_allergy_summary_len check (allergy_summary is null or char_length(allergy_summary) <= 2000);

create or replace function public.insert_auto_menu_submission(
  p_event_id uuid,
  p_counts jsonb,
  p_titles jsonb,
  p_total int,
  p_unanswered int,
  p_allergy_notes jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_inserted int;
begin
  insert into event_menu_submissions (event_id, sent_by, counts, menu_titles, total, source, unanswered, allergy_notes)
  select p_event_id, 'Автоматски', p_counts, p_titles, p_total, 'auto', p_unanswered, p_allergy_notes
  where not exists (select 1 from event_menu_submissions where event_id = p_event_id);
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;
revoke all on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int, jsonb) to service_role;

drop function if exists public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int);

commit;
