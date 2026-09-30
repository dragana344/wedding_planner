-- Session 2 (A13), owner decision 2026-09-30: three basic invitation
-- templates, three premium behind `invitation_all_templates`. The list moves
-- out of enforce_entitlements() (0049 hard-coded two) into one function the
-- app's BASIC_TEMPLATE_IDS is tested against
-- (tests/supabase/0063_invitation_templates.test.ts).
--
-- enforce_entitlements() below is 0049's body unchanged except for where
-- v_basic comes from; CREATE OR REPLACE keeps its triggers and grants.

create or replace function public.basic_invitation_templates()
returns text[]
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select array['romantic-floral', 'elegant-gold', 'classic-minimal'];
$$;
revoke all on function public.basic_invitation_templates() from public, anon, authenticated;
grant execute on function public.basic_invitation_templates() to service_role;

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
  v_basic text[] := basic_invitation_templates();
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
