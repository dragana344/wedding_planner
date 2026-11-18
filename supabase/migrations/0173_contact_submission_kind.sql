-- 0173: public venue self-signup is closed; /signup now takes a "request a
-- demo" form instead. It lands in the same admin inbox as the contact form
-- (contact_submissions), so the admin needs to tell the two apart. The demo
-- details (venue, city, phone) travel in `message`, so no new personal
-- columns: `kind` is only the row's type, not personal data.

alter table public.contact_submissions
  add column kind text not null default 'contact' check (kind in ('contact', 'demo'));
