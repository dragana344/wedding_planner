-- 0083: the co_organizers entitlement is a limit (admin spec §4.1). Enforced
-- in the database, like 0049's max_guests/max_rooms/max_active_events, so
-- every path that creates a co-organizer (create_co_organizer, a direct
-- service-role insert) is covered. A null limit means unlimited and skips
-- the check; a disabled feature resolves to 0 (0048), so nothing more can be
-- added. Existing rows over a lowered limit stay (D7): only inserts are
-- checked, deletes never.

begin;

create or replace function public.enforce_co_organizer_limit()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue uuid;
  v_limit integer;
  v_count integer;
begin
  select venue_id into v_venue from events where id = new.event_id;
  v_limit := feature_limit(v_venue, new.event_id, 'co_organizers');
  if v_limit is not null then
    -- Serialises concurrent inserts for the same event (same pattern as 0049).
    perform pg_advisory_xact_lock(hashtextextended('ent:co_organizers:' || new.event_id, 0));
    select count(*) into v_count from event_co_organizers where event_id = new.event_id;
    if v_count >= v_limit then
      raise exception 'Достигнат е лимитот од % дополнителни организатори.', v_limit using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_co_organizer_limit() from public, anon, authenticated;

create trigger event_co_organizers_entitlements before insert on public.event_co_organizers
  for each row execute function public.enforce_co_organizer_limit();

commit;
