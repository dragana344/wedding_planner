-- 0077 (Session 3): follow-ups to the seating review.
--
--   I5  events.seating_rev: a counter bumped by every write of the couple's
--       seating_draft / seating_history. The server writes them only
--       "where seating_rev = <what it read>" and retries otherwise, so two
--       quick edits (or two tabs) no longer overwrite each other.
--   M2  a hall taken off an event frees the seats in it.

alter table public.events add column seating_rev bigint not null default 0;

create or replace function public.free_seats_of_removed_room()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  delete from event_seat_assignments where event_id = old.event_id and room_id = old.room_id;
  return null;
end;
$$;

revoke all on function public.free_seats_of_removed_room() from public, anon, authenticated;

create trigger event_rooms_free_seats
  after delete on public.event_rooms
  for each row execute function public.free_seats_of_removed_room();
