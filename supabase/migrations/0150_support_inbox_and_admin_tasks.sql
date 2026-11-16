-- 0150: two support systems.
--
-- 1. Inbox (venues/couples/public → admin). The admin "Пораки и барања" page
--    lists contact_submissions (public form) and support_tickets (venue and
--    couple dashboards) together, so both move to one status set:
--    new → in_progress → done. A ticket also becomes a back-and-forth
--    thread (support_ticket_messages); the single admin_comment it had is
--    carried over as the thread's first admin reply and then dropped.
--    awaiting_admin: the requester spoke last (drives the admin badge);
--    requester_unread: an admin reply the requester hasn't opened yet.
--
-- 2. Internal tasks between admins (admin_tasks + admin_task_comments).
--    assigned_to null means "every admin": whoever starts it takes it.
--
-- Same access pattern as 0089: RLS enabled, zero policies, service_role
-- only — authorization lives in application code.

begin;

-- Inbox: contact messages -------------------------------------------------

alter table public.contact_submissions drop constraint contact_submissions_status_check;
update public.contact_submissions
  set status = case status when 'read' then 'in_progress' when 'answered' then 'done' else status end;
alter table public.contact_submissions
  add constraint contact_submissions_status_check check (status in ('new', 'in_progress', 'done'));

-- Inbox: support tickets --------------------------------------------------

alter table public.support_tickets drop constraint support_tickets_status_check;
update public.support_tickets set status = 'new' where status = 'pending';
alter table public.support_tickets
  alter column status set default 'new',
  add constraint support_tickets_status_check check (status in ('new', 'in_progress', 'done')),
  add column awaiting_admin boolean not null default true,
  add column requester_unread boolean not null default false,
  add column last_message_at timestamptz not null default now();

update public.support_tickets
  set awaiting_admin = status <> 'done' and admin_comment is null,
      requester_unread = admin_comment is not null,
      last_message_at = coalesce(resolved_at, created_at);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author text not null check (author in ('requester', 'admin')),
  admin_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index support_ticket_messages_ticket_idx on public.support_ticket_messages(ticket_id, created_at);
create index support_ticket_messages_admin_user_idx on public.support_ticket_messages(admin_user_id);
create index support_tickets_awaiting_admin_idx on public.support_tickets(awaiting_admin) where awaiting_admin;

insert into public.support_ticket_messages (ticket_id, author, body, created_at)
  select id, 'admin', admin_comment, coalesce(resolved_at, created_at)
  from public.support_tickets
  where admin_comment is not null and btrim(admin_comment) <> '';

alter table public.support_tickets drop column admin_comment;

alter table public.support_ticket_messages enable row level security;

-- Admin tasks ----------------------------------------------------------------

create table public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index admin_tasks_assigned_to_idx on public.admin_tasks(assigned_to);
create index admin_tasks_created_by_idx on public.admin_tasks(created_by);

create table public.admin_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.admin_tasks(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index admin_task_comments_task_idx on public.admin_task_comments(task_id, created_at);
create index admin_task_comments_author_idx on public.admin_task_comments(author_id);

alter table public.admin_tasks enable row level security;
alter table public.admin_task_comments enable row level security;

commit;
