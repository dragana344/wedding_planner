-- 0041 (REL-005): multi-step writes that used to be separate PostgREST calls
-- run as one function call each, i.e. one transaction: a failure part-way
-- leaves nothing half-written. Validation and reads stay in TypeScript, so
-- inputs, outputs and messages are unchanged. Called only by server code with
-- the service-role client.

-- Venue self-signup: venue + staff row together (idempotent per user).
create or replace function public.provision_venue(p_user_id uuid, p_venue_name text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_venue_id uuid;
begin
  -- Serialise concurrent retries for the same user.
  perform pg_advisory_xact_lock(hashtext('provision_venue:' || p_user_id::text));
  select venue_id into v_venue_id from venue_staff where user_id = p_user_id limit 1;
  if v_venue_id is not null then
    return v_venue_id;
  end if;
  insert into venues (name) values (p_venue_name) returning id into v_venue_id;
  insert into venue_staff (user_id, venue_id) values (p_user_id, v_venue_id);
  return v_venue_id;
end;
$$;

-- Couple confirms a room's seating: replace the staff-visible layout with the
-- draft and stamp the room as confirmed.
create or replace function public.confirm_event_seating(p_event_id uuid, p_room_id uuid, p_elements jsonb, p_confirmed_at text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from event_layout_elements where event_id = p_event_id and room_id = p_room_id;
  insert into event_layout_elements (event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm, rotation_deg, label)
  select p_event_id, p_room_id, e.element_type, e.table_type_id, e.x_cm, e.y_cm, e.width_cm, e.length_cm, e.rotation_deg, e.label
  from jsonb_to_recordset(coalesce(p_elements, '[]'::jsonb)) as e(
    element_type text, table_type_id uuid, x_cm numeric, y_cm numeric,
    width_cm numeric, length_cm numeric, rotation_deg numeric, label text
  );
  update events
  set seating_confirmed_at = coalesce(seating_confirmed_at, '{}'::jsonb) || jsonb_build_object(p_room_id::text, p_confirmed_at)
  where id = p_event_id;
end;
$$;

-- Agenda reorder: swap two items' sort_order in one statement.
create or replace function public.swap_agenda_items(p_event_id uuid, p_item_a uuid, p_item_b uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update event_agenda_items t
  set sort_order = o.new_order
  from (
    select a.id, b.sort_order as new_order
    from event_agenda_items a, event_agenda_items b
    where a.event_id = p_event_id and b.event_id = p_event_id
      and ((a.id = p_item_a and b.id = p_item_b) or (a.id = p_item_b and b.id = p_item_a))
  ) o
  where t.id = o.id;
$$;

-- Couple picks a venue menu template: set it, drop any custom picks, and
-- drop quantities for dishes no longer on the menu.
create or replace function public.set_event_menu_template(p_event_id uuid, p_template_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update events set menu_template_id = p_template_id where id = p_event_id;
  delete from event_custom_menu_items where event_id = p_event_id;
  delete from event_menu_item_quantities q
  where q.event_id = p_event_id
    and q.menu_item_id not in (select menu_item_id from menu_template_items where menu_template_id = p_template_id);
end;
$$;

-- Couple builds a custom menu: clear the template, replace the picks, prune
-- quantities to the new picks.
create or replace function public.set_event_menu_custom(p_event_id uuid, p_menu_item_ids uuid[])
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update events set menu_template_id = null where id = p_event_id;
  delete from event_custom_menu_items where event_id = p_event_id;
  insert into event_custom_menu_items (event_id, menu_item_id)
  select p_event_id, unnest(coalesce(p_menu_item_ids, '{}'));
  delete from event_menu_item_quantities q
  where q.event_id = p_event_id and not (q.menu_item_id = any (coalesce(p_menu_item_ids, '{}')));
end;
$$;

-- Couple saves guest counts per dish: replace the event's rows.
create or replace function public.replace_menu_item_quantities(p_event_id uuid, p_quantities jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from event_menu_item_quantities where event_id = p_event_id;
  insert into event_menu_item_quantities (event_id, menu_item_id, guest_count)
  select p_event_id, q.menu_item_id, q.guest_count
  from jsonb_to_recordset(coalesce(p_quantities, '[]'::jsonb)) as q(menu_item_id uuid, guest_count integer);
end;
$$;

revoke all on function public.provision_venue(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_event_seating(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.swap_agenda_items(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_event_menu_template(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_event_menu_custom(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.replace_menu_item_quantities(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.provision_venue(uuid, text) to service_role;
grant execute on function public.confirm_event_seating(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.swap_agenda_items(uuid, uuid, uuid) to service_role;
grant execute on function public.set_event_menu_template(uuid, uuid) to service_role;
grant execute on function public.set_event_menu_custom(uuid, uuid[]) to service_role;
grant execute on function public.replace_menu_item_quantities(uuid, jsonb) to service_role;
