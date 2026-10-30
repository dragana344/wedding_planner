-- 0115: the "Нов настан" wizard can now pick more than one menu for an
-- event (e.g. a classic menu plus a посно/vegan one for guests with
-- different diets) — add a many-to-many table mirroring event_rooms (0003),
-- including its later read-only-for-staff treatment (0096: writes only
-- happen through the create_event_full RPC, never directly by staff).
--
-- events.menu_template_id (the original single-menu column) is left exactly
-- as it is — nothing reads or writes it differently. create_event_full now
-- also accepts the full list and fans it out into this table; the caller
-- (lib/venue/events.ts) keeps setting the scalar column to the first picked
-- menu, so every existing consumer of that column (the couple's own menu
-- page, printed invitations) keeps working unchanged. Reconciling those to
-- the full multi-menu list is a deliberate follow-up, not done here.

begin;

create table event_menu_templates (
  event_id uuid not null references events(id) on delete cascade,
  menu_template_id uuid not null references menu_templates(id) on delete cascade,
  primary key (event_id, menu_template_id)
);

create index event_menu_templates_menu_template_id_idx on event_menu_templates (menu_template_id);

alter table event_menu_templates enable row level security;

create policy "venue staff reads own event_menu_templates" on event_menu_templates
  for select using (
    exists (select 1 from events where events.id = event_menu_templates.event_id and is_venue_staff_for(events.venue_id))
  );

-- SEC-023: anon holds no privileges on any public table; new tables start
-- closed and each migration grants only what it needs (0031).
grant select, insert, update, delete on event_menu_templates to authenticated;
grant all on event_menu_templates to service_role;

drop function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid, uuid[], text, text, text, numeric, numeric, text, text);

create or replace function public.create_event_full(
  p_venue_id uuid,
  p_couple_names text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_type text,
  p_status text,
  p_guest_count_estimate int,
  p_menu_template_id uuid,
  p_room_ids uuid[],
  p_contact_email text,
  p_contact_email_2 text,
  p_contact_phone text,
  p_total_price numeric,
  p_deposit_paid numeric,
  p_username text,
  p_password text,
  p_menu_template_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_event_id uuid;
begin
  insert into events (
    venue_id, couple_names, event_date, start_time, end_time, event_type, status,
    guest_count_estimate, menu_template_id, total_price, deposit_paid,
    contact_email, contact_email_2, contact_phone
  ) values (
    p_venue_id, p_couple_names, p_event_date, p_start_time, p_end_time, p_event_type, p_status,
    p_guest_count_estimate, p_menu_template_id, p_total_price, p_deposit_paid,
    p_contact_email, p_contact_email_2, p_contact_phone
  )
  returning id into v_event_id;

  if p_room_ids is not null and array_length(p_room_ids, 1) > 0 then
    insert into event_rooms (event_id, room_id)
    select v_event_id, r from unnest(p_room_ids) as r;
  end if;

  if p_menu_template_ids is not null and array_length(p_menu_template_ids, 1) > 0 then
    insert into event_menu_templates (event_id, menu_template_id)
    select v_event_id, m from unnest(p_menu_template_ids) as m;
  end if;

  -- Raises on its own (short password, etc.); that aborts this whole
  -- function, which rolls back the event, event_rooms and
  -- event_menu_templates inserts above too.
  perform public.create_event_credentials(v_event_id, p_username, p_password);

  return v_event_id;
end;
$$;
revoke all on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid, uuid[], text, text, text, numeric, numeric, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.create_event_full(uuid, text, date, time, time, text, text, int, uuid, uuid[], text, text, text, numeric, numeric, text, text, uuid[]) to service_role;

commit;
