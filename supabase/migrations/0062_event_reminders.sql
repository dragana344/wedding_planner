-- Session 2 (A10): a reminder email to guests who said yes or "later",
-- 15 days before the event at 10:00 Skopje time unless the couple picks
-- another time. Sent by the /api/cron/reminders job.
--
-- A row exists only once the couple changes the time or the cron claims the
-- reminder; until then the default applies (due_event_reminders).

create table public.event_reminders (
  event_id uuid primary key references public.events(id) on delete cascade,
  send_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'cancelled')),
  sent_at timestamptz,
  sent_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.event_reminders enable row level security;
revoke all on public.event_reminders from anon, authenticated;
grant all on public.event_reminders to service_role;

-- Per guest, so a run that dies half way never emails anyone twice.
alter table public.event_guests add column reminder_sent_at timestamptz;

create or replace function public.default_reminder_at(p_event_date date)
returns timestamptz
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select ((p_event_date - 15) + time '10:00') at time zone 'Europe/Skopje';
$$;
revoke all on function public.default_reminder_at(date) from public, anon, authenticated;
grant execute on function public.default_reminder_at(date) to service_role;

-- Events whose reminder is due at p_now: still ahead (Skopje date), not
-- cancelled or erased, reminder neither sent nor switched off (a claim left
-- by a run that died over 30 minutes ago counts as due again). The default
-- time counts only if it was still ahead when the event was booked.
create or replace function public.due_event_reminders(p_now timestamptz)
returns table(event_id uuid, send_at timestamptz)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select e.id, coalesce(r.send_at, default_reminder_at(e.event_date))
  from events e
  left join event_reminders r on r.event_id = e.id
  where e.status <> 'cancelled'
    and e.personal_data_erased_at is null
    and e.event_date >= (p_now at time zone 'Europe/Skopje')::date
    and (coalesce(r.status, 'scheduled') = 'scheduled' or (r.status = 'sending' and r.updated_at < p_now - interval '30 minutes'))
    and coalesce(r.send_at, default_reminder_at(e.event_date)) <= p_now
    and (r.event_id is not null or default_reminder_at(e.event_date) >= e.created_at);
$$;
revoke all on function public.due_event_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.due_event_reminders(timestamptz) to service_role;

-- Marks a due reminder as being sent; true for exactly one caller. A claim
-- older than 30 minutes (a run that died) can be taken over; guests already
-- reminded are skipped via reminder_sent_at.
create or replace function public.claim_event_reminder(p_event_id uuid, p_now timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_claimed boolean;
begin
  insert into event_reminders (event_id, send_at, status, updated_at)
  select e.id, default_reminder_at(e.event_date), 'sending', p_now
  from events e where e.id = p_event_id
  on conflict (event_id) do nothing;
  if found then
    return true;
  end if;

  update event_reminders
    set status = 'sending', updated_at = p_now
    where event_id = p_event_id
      and (status = 'scheduled' or (status = 'sending' and updated_at < p_now - interval '30 minutes'))
    returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;
revoke all on function public.claim_event_reminder(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_event_reminder(uuid, timestamptz) to service_role;
