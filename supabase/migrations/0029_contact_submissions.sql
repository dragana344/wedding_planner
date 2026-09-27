-- supabase/migrations/0029_contact_submissions.sql
-- Captures the marketing page's contact form. No email/CRM integration
-- exists yet, so submissions are just durably stored for a manual `select`
-- until a real delivery destination is decided. Same access pattern as
-- every couple/venue-facing table added this project: RLS enabled with
-- zero anon/authenticated policies, service_role only — the contact API
-- route is the only thing that ever writes or reads this table.

create table contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table contact_submissions enable row level security;

grant usage on schema public to service_role;
grant all on contact_submissions to service_role;
