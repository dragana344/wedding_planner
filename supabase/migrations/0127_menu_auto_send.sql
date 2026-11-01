-- 0127: the automatic send of final menu numbers (cron). Inserts the 'auto'
-- submission only while the event has none, in the same statement, so two
-- overlapping cron runs produce one submission. Returns whether it inserted.

create function public.insert_auto_menu_submission(
  p_event_id uuid,
  p_counts jsonb,
  p_titles jsonb,
  p_total int,
  p_unanswered int
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_inserted int;
begin
  insert into event_menu_submissions (event_id, sent_by, counts, menu_titles, total, source, unanswered)
  select p_event_id, 'Автоматски', p_counts, p_titles, p_total, 'auto', p_unanswered
  where not exists (select 1 from event_menu_submissions where event_id = p_event_id);
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;
revoke all on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int) from public, anon, authenticated;
grant execute on function public.insert_auto_menu_submission(uuid, jsonb, jsonb, int, int) to service_role;
