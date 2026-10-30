-- 0124: update_event_full took the event's FINAL menu list, computed in JS
-- from a separate SELECT of the event's current links taken moments earlier.
-- Two concurrent saves on the same event (e.g. two tabs, or a manager and an
-- in-flight custom-menu save) each compute their own "final" list from the
-- same stale read; whichever RPC call commits last silently overwrites the
-- other's add or remove. update_event_full now takes exactly what this
-- window added and removed (already what the caller has, per
-- UpdateEventInput's own doc comment) and applies only that delta inside the
-- function's existing transaction — so a concurrent change to a *different*
-- menu link always survives, and the delta is now the only thing that needs
-- locking (the `events` row UPDATE already provides it).
--
-- The orphan cleanup for an event-only custom menu taken off the event
-- (previously a second, separate JS-side DELETE after the RPC returned, so a
-- transient failure there could leave an unlinked orphan for
-- saveEventCustomMenu's findExisting() to resurrect) moves into the same
-- transaction: it is now atomic with the rest of the save.

begin;

drop function public.update_event_full(uuid, uuid, text, date, time, time, text, text, int, uuid[], uuid[]);

create function public.update_event_full(
  p_event_id uuid,
  p_venue_id uuid,
  p_couple_names text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_type text,
  p_status text,
  p_guest_count_estimate int,
  p_room_ids uuid[],
  p_added_menu_ids uuid[],
  p_removed_menu_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update events set
    couple_names = p_couple_names,
    event_date = p_event_date,
    start_time = p_start_time,
    end_time = p_end_time,
    event_type = p_event_type,
    status = p_status,
    guest_count_estimate = p_guest_count_estimate
  where id = p_event_id and venue_id = p_venue_id;

  if not found then
    return false;
  end if;

  delete from event_rooms
  where event_id = p_event_id
    and not (room_id = any(coalesce(p_room_ids, array[]::uuid[])));

  insert into event_rooms (event_id, room_id)
  select p_event_id, r
  from unnest(coalesce(p_room_ids, array[]::uuid[])) as r
  where not exists (select 1 from event_rooms er where er.event_id = p_event_id and er.room_id = r);

  -- Only the menus this window explicitly removed: unlinking one deletes the
  -- guests' counts for it (trigger from 0119/0123), kept and untouched menus
  -- keep theirs.
  delete from event_menu_templates
  where event_id = p_event_id
    and menu_template_id = any(coalesce(p_removed_menu_ids, array[]::uuid[]));

  insert into event_menu_templates (event_id, menu_template_id)
  select p_event_id, m
  from (select distinct unnest(coalesce(p_added_menu_ids, array[]::uuid[])) as m) as d
  where not exists (select 1 from event_menu_templates em where em.event_id = p_event_id and em.menu_template_id = d.m);

  -- An event-only custom menu this window took off the event (removed and
  -- not re-added in the same window) has no other place to live: delete it
  -- now, in the same transaction (its items and guests' counts cascade).
  delete from menu_templates
  where venue_id = p_venue_id
    and event_id = p_event_id
    and id = any(coalesce(p_removed_menu_ids, array[]::uuid[]))
    and not (id = any(coalesce(p_added_menu_ids, array[]::uuid[])));

  return true;
end;
$$;
revoke all on function public.update_event_full(uuid, uuid, text, date, time, time, text, text, int, uuid[], uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.update_event_full(uuid, uuid, text, date, time, time, text, text, int, uuid[], uuid[], uuid[]) to service_role;

commit;
