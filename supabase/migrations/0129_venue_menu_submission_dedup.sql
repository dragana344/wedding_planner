-- 0129: the venue's "enter the final numbers" route did a plain insert, so
-- two overlapping requests for the same event (a retried fetch, two tabs)
-- could both land, producing duplicate submission rows with the same
-- counts. insert_venue_menu_submission inserts only while the event has no
-- venue submission with the same counts sent in the last few seconds, same
-- "where not exists, in the same statement" guard 0127 already uses for the
-- cron auto-send.

create function public.insert_venue_menu_submission(
  p_event_id uuid,
  p_sent_by text,
  p_counts jsonb,
  p_titles jsonb,
  p_total int
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_inserted int;
begin
  insert into event_menu_submissions (event_id, sent_by, counts, menu_titles, total, source, seen_at, seen_by, unanswered)
  select p_event_id, p_sent_by, p_counts, p_titles, p_total, 'venue', now(), p_sent_by, null
  where not exists (
    select 1 from event_menu_submissions
    where event_id = p_event_id
      and source = 'venue'
      and counts = p_counts
      and sent_at > now() - interval '5 seconds'
  );
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;
revoke all on function public.insert_venue_menu_submission(uuid, text, jsonb, jsonb, int) from public, anon, authenticated;
grant execute on function public.insert_venue_menu_submission(uuid, text, jsonb, jsonb, int) to service_role;
