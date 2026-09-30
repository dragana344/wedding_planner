-- 0049: enforce plan entitlements in the database (admin dashboard spec §4.4).
-- Inserts/updates are checked; deletes never are (D7). Every role, including
-- the service role, is subject to these checks. The default plan
-- ("Стандарден", 0048) enables every switch and leaves max_guests/max_rooms/
-- max_active_events unlimited (feature_limit() null there), so the limit
-- checks below are always skipped for it — existing venues never see a
-- refusal from this migration.

begin;

create or replace function public.entitlement_locked()
returns void
language plpgsql
as $$
begin
  raise exception 'Оваа функција не е вклучена во вашиот пакет.' using errcode = 'P0001';
end;
$$;
revoke all on function public.entitlement_locked() from public, anon, authenticated;

-- SECURITY DEFINER so the checks below (and the event_has_feature/
-- venue_has_feature/feature_limit -> effective_features chain they call
-- into, 0048) run with the function owner's privileges regardless of caller
-- role — the same "runs as definer (postgres)" trust boundary those
-- functions already rely on. This does not widen write access: RLS's WITH
-- CHECK on the target table still runs after every BEFORE ROW trigger (the
-- order is trigger, then WITH CHECK, then the write) and independently
-- refuses a row that does not belong to the caller's own venue, so a staff
-- member can never use this trigger to probe or write another venue's rows.
create or replace function public.enforce_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue uuid;
  v_limit integer;
  v_count integer;
  v_only_nulled boolean;
  v_basic text[] := array['romantic-floral', 'elegant-gold'];
begin
  -- Erasure (0043's `update event_layout_elements set label = null ...`) and
  -- ON DELETE SET NULL cascades (e.g. deleting a table_types row nulls out
  -- room_layout_elements/event_layout_elements.table_type_id) null out a
  -- column with no intent to touch an entitlement-gated field's *value*.
  -- D7 already requires deletes to never be blocked by a locked plan; the
  -- same principle extends to an update whose only effect is removing
  -- information (every changed column becomes null) — otherwise a locked
  -- plan could leave the privacy retention sweep or a routine FK cascade
  -- permanently stuck. Applies to every UPDATE branch below.
  if tg_op = 'UPDATE' then
    select coalesce(bool_and(n.value = 'null'::jsonb), true)
    into v_only_nulled
    from jsonb_each(to_jsonb(new)) as n(key, value)
    join jsonb_each(to_jsonb(old)) as o(key, value) using (key)
    where n.value is distinct from o.value;
    if v_only_nulled then
      return new;
    end if;
  end if;

  case tg_table_name
  when 'event_guests' then
    select venue_id into v_venue from events where id = new.event_id;
    v_limit := feature_limit(v_venue, new.event_id, 'max_guests');
    if v_limit is not null then
      -- Serialises concurrent inserts for the same event so two requests
      -- racing the same count-then-insert check can't both slip in over
      -- the limit.
      perform pg_advisory_xact_lock(hashtextextended('ent:guests:' || new.event_id, 0));
      select count(*) into v_count from event_guests where event_id = new.event_id;
      if v_count >= v_limit then
        raise exception 'Достигнат е лимитот од % гости за овој настан.', v_limit using errcode = 'P0001';
      end if;
    end if;

  when 'rooms' then
    v_limit := feature_limit(new.venue_id, null, 'max_rooms');
    if v_limit is not null then
      perform pg_advisory_xact_lock(hashtextextended('ent:rooms:' || new.venue_id, 0));
      select count(*) into v_count from rooms where venue_id = new.venue_id;
      if v_count >= v_limit then
        raise exception 'Достигнат е лимитот од % простории.', v_limit using errcode = 'P0001';
      end if;
    end if;

  when 'events' then
    -- OLD.status simply reads as NULL when TG_OP = 'INSERT' (there is no
    -- error referencing an unassigned OLD field access like this; verified
    -- directly against this Postgres build), and `tg_op = 'INSERT'` being
    -- true makes the OR's result TRUE regardless of evaluation order (three-
    -- valued logic: TRUE OR NULL = TRUE), so this is safe as one expression.
    if new.status not in ('completed', 'cancelled')
       and (tg_op = 'INSERT' or old.status in ('completed', 'cancelled')) then
      v_limit := feature_limit(new.venue_id, null, 'max_active_events');
      if v_limit is not null then
        perform pg_advisory_xact_lock(hashtextextended('ent:events:' || new.venue_id, 0));
        select count(*) into v_count from events
        where venue_id = new.venue_id and status not in ('completed', 'cancelled') and id <> new.id;
        if v_count >= v_limit then
          raise exception 'Достигнат е лимитот од % активни настани.', v_limit using errcode = 'P0001';
        end if;
      end if;
    end if;

  when 'reservations' then
    if not venue_has_feature(new.venue_id, 'reservations') then perform entitlement_locked(); end if;

  when 'room_fixed_elements', 'room_layout_elements' then
    select venue_id into v_venue from rooms where id = new.room_id;
    if not venue_has_feature(v_venue, 'floor_plan') then perform entitlement_locked(); end if;

  when 'event_showcase_photos' then
    select venue_id into v_venue from events where id = new.event_id;
    if not venue_has_feature(v_venue, 'showcase_photos') then perform entitlement_locked(); end if;

  when 'event_layout_elements' then
    if not event_has_feature(new.event_id, 'seating') then perform entitlement_locked(); end if;

  when 'event_custom_menu_items' then
    if not event_has_feature(new.event_id, 'custom_menu') then perform entitlement_locked(); end if;

  when 'event_invitations' then
    -- The `invitation` switch itself only gates INSERT and updates that
    -- change what's shown (template_id or message) — same OLD-on-INSERT
    -- reasoning as the `events` branch above applies to every `old.*`
    -- reference below.
    if tg_op = 'INSERT' or new.template_id is distinct from old.template_id or new.message is distinct from old.message then
      if not event_has_feature(new.event_id, 'invitation') then perform entitlement_locked(); end if;
    end if;

    if (tg_op = 'INSERT' or new.template_id is distinct from old.template_id)
       and not (new.template_id = any (v_basic))
       and not event_has_feature(new.event_id, 'invitation_all_templates') then
      perform entitlement_locked();
    end if;

    if new.photo_path is not null and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path)
       and not event_has_feature(new.event_id, 'invitation_photo') then
      perform entitlement_locked();
    end if;

  else
    -- Defensive: this function is only ever attached as a trigger on the
    -- tables listed above, but a CASE with no matching WHEN and no ELSE
    -- raises "case not found", so an unlisted table fails safe instead.
    null;
  end case;

  return new;
end;
$$;
revoke all on function public.enforce_entitlements() from public, anon, authenticated;

create trigger event_guests_entitlements before insert on public.event_guests
  for each row execute function public.enforce_entitlements();
create trigger rooms_entitlements before insert on public.rooms
  for each row execute function public.enforce_entitlements();
create trigger events_entitlements before insert or update of status on public.events
  for each row execute function public.enforce_entitlements();
create trigger reservations_entitlements before insert or update on public.reservations
  for each row execute function public.enforce_entitlements();
create trigger room_fixed_elements_entitlements before insert or update on public.room_fixed_elements
  for each row execute function public.enforce_entitlements();
create trigger room_layout_elements_entitlements before insert or update on public.room_layout_elements
  for each row execute function public.enforce_entitlements();
create trigger event_showcase_photos_entitlements before insert on public.event_showcase_photos
  for each row execute function public.enforce_entitlements();
create trigger event_layout_elements_entitlements before insert or update on public.event_layout_elements
  for each row execute function public.enforce_entitlements();
create trigger event_custom_menu_items_entitlements before insert on public.event_custom_menu_items
  for each row execute function public.enforce_entitlements();
create trigger event_invitations_entitlements before insert or update on public.event_invitations
  for each row execute function public.enforce_entitlements();

commit;
