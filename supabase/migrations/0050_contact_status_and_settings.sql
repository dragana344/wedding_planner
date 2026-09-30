-- 0050: contact message handling and DB-stored platform settings (admin spec §5, task 4.1).

begin;

alter table public.contact_submissions
  add column status text not null default 'new' check (status in ('new', 'read', 'answered')),
  add column handled_at timestamptz;

create table public.platform_settings (
  id boolean primary key default true check (id),
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.platform_settings (id) values (true);

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant all on public.platform_settings to service_role;

commit;
