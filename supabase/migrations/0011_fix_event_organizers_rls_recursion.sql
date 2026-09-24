-- 0010's "organizer reads own event" policy on events queried event_organizers
-- directly, but event_organizers' own policy queries back into events —
-- Postgres detects this as infinite recursion when evaluating RLS. Fix: read
-- event_organizers through a security definer function (same pattern as
-- is_venue_staff_for), which bypasses event_organizers' RLS instead of
-- triggering it, breaking the cycle.

create or replace function is_organizer_for_event(target_event_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from event_organizers
    where event_id = target_event_id and user_id = auth.uid()
  );
$$;

drop policy "organizer reads own event" on events;

create policy "organizer reads own event" on events
  for select using (is_organizer_for_event(id));
