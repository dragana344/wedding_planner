-- 0042
--   SEC-018  append-only audit log for sensitive actions. No personal data:
--            who (user id / role), what, which venue/event/row, when, and a
--            request id when the action came through our API.
--   SEC-021  public RSVP changes are recorded, and the couple can see on each
--            guest when the invitation link last changed the answer and what
--            it was before. (Decision: guests may still change their own
--            answer through the link; every change is visible to the couple.)

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('staff', 'couple', 'guest', 'system')),
  actor_id uuid,
  action text not null check (char_length(action) between 1 and 100),
  venue_id uuid,
  event_id uuid,
  target_id uuid,
  request_id text check (request_id is null or char_length(request_id) <= 100),
  details jsonb not null default '{}'::jsonb check (octet_length(details::text) <= 4000)
);

create index audit_log_venue_time_idx on public.audit_log (venue_id, occurred_at desc);
create index audit_log_event_time_idx on public.audit_log (event_id, occurred_at desc);

alter table public.audit_log enable row level security;

-- Staff can read their own venue's trail; nobody writes except server code
-- (service_role) and the SECURITY DEFINER triggers below.
create policy "venue staff read own audit log" on public.audit_log
  for select to authenticated
  using (venue_id is not null and public.is_venue_staff_for(venue_id));

revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated;
grant select, insert on public.audit_log to service_role;

-- Append-only, for every role: the table owner can still truncate for a
-- documented erasure (DATA-005), nothing else can rewrite history.
create or replace function public.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

-- Staff actions happen from the browser (RLS-bound), so they are captured by
-- triggers rather than in app code.
create or replace function public.audit_staff_action()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_venue_id uuid;
  v_action text;
  v_details jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'events' then
    v_event_id := old.id;
    v_venue_id := old.venue_id;
    v_action := 'event_deleted';
    v_details := jsonb_build_object('event_date', old.event_date, 'event_type', old.event_type, 'status', old.status);
  else -- event_credentials
    v_event_id := new.event_id;
    select venue_id into v_venue_id from public.events where id = v_event_id;
    v_action := case when tg_op = 'INSERT' then 'couple_credentials_created' else 'couple_password_regenerated' end;
  end if;

  insert into public.audit_log (actor_type, actor_id, action, venue_id, event_id, target_id, details)
  values (case when auth.uid() is null then 'system' else 'staff' end, auth.uid(), v_action, v_venue_id, v_event_id, v_event_id, v_details);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_staff_action() from public, anon, authenticated;
revoke all on function public.audit_log_is_append_only() from public, anon, authenticated;

create trigger event_credentials_audit_insert
  after insert on public.event_credentials
  for each row execute function public.audit_staff_action();

create trigger event_credentials_audit_password
  after update of password_hash on public.event_credentials
  for each row when (old.password_hash is distinct from new.password_hash)
  execute function public.audit_staff_action();

create trigger events_audit_delete
  before delete on public.events
  for each row execute function public.audit_staff_action();

-- SEC-021: the couple sees the last public-link change on each guest.
alter table public.event_guests
  add column rsvp_changed_via_link_at timestamptz,
  add column rsvp_previous_status text
    check (rsvp_previous_status is null or rsvp_previous_status in ('invited', 'confirmed', 'declined', 'pending'));
