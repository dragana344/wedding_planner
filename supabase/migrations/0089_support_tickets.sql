-- 0089: support tickets. A venue staff member or a couple reports a
-- problem; it starts "pending"; the team resolves it and marks it "done",
-- optionally with a comment. Admin-facing (lib/admin/queries.ts) and
-- submitted from two places (venue dashboard, couple dashboard) — so
-- venue_id is always set (resolved server-side, never trusted from the
-- client), while event_id is set only when a couple submitted it, letting
-- the admin list show which couple/event a ticket came from.
--
-- Same access pattern as every couple/venue-facing table since Sub-project
-- 2: RLS enabled with zero anon/authenticated policies, service_role only —
-- authorization is enforced entirely in application code.

begin;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  submitted_by text not null check (submitted_by in ('venue', 'couple')),
  name text not null,
  problem text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  admin_comment text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index support_tickets_venue_id_idx on public.support_tickets(venue_id);
create index support_tickets_event_id_idx on public.support_tickets(event_id);
create index support_tickets_status_idx on public.support_tickets(status);

alter table public.support_tickets enable row level security;

commit;
