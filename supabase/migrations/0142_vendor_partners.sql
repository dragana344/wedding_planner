-- 0142: admin-curated vendor/partner directory (bands, decoration, catering,
-- florists, jewelers, equipment, photography, cakes/desserts, makeup & hair).
-- No vendor accounts: every row is created/edited by platform admin staff.
-- Shown publicly on the landing page and inside the couple dashboard — same
-- data, no RLS read policy needed, exactly like pricing_cards (0085): every
-- read goes through the service-role client in lib/vendor-partners/partners.ts.

begin;

create table public.vendor_partners (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'music', 'decoration', 'catering', 'florist', 'jeweler',
    'equipment', 'photography', 'cakes_desserts', 'makeup_hair'
  )),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  city text not null check (char_length(btrim(city)) between 1 and 60),
  short_description text not null check (char_length(btrim(short_description)) between 1 and 200),
  full_description text check (full_description is null or char_length(full_description) <= 2000),
  cover_photo_path text,
  gallery_photo_paths text[] not null default '{}' check (cardinality(gallery_photo_paths) <= 12),
  phone text,
  viber_phone text,
  whatsapp_phone text,
  website_url text,
  instagram_url text,
  facebook_url text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_partners enable row level security;
revoke all on public.vendor_partners from anon, authenticated;
grant all on public.vendor_partners to service_role;

insert into storage.buckets (id, name, public) values ('vendor-partner-photos', 'vendor-partner-photos', true);

create policy "vendor_partner_photos_public_read" on storage.objects
  for select using (bucket_id = 'vendor-partner-photos');

commit;
