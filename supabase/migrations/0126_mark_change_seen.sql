-- 0126: "Видено" for change marks. One statement keeps the greater of the
-- stored and the new position, so pressing Видено for what the viewer saw
-- never hides a change that arrived meanwhile (and two presses can't move it
-- backwards).

create function public.mark_change_seen(
  p_event_id uuid,
  p_viewer text,
  p_section text,
  p_up_to timestamptz,
  p_seen_by text
)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  insert into event_change_seen (event_id, viewer, section, seen_up_to, seen_by)
  values (p_event_id, p_viewer, p_section, p_up_to, p_seen_by)
  on conflict (event_id, viewer, section) do update
  set seen_up_to = greatest(event_change_seen.seen_up_to, excluded.seen_up_to),
      seen_by = case when excluded.seen_up_to > event_change_seen.seen_up_to
                     then excluded.seen_by else event_change_seen.seen_by end;
$$;
revoke all on function public.mark_change_seen(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.mark_change_seen(uuid, text, text, timestamptz, text) to service_role;
