-- 0085: price cards for the public landing page ("Цени → Планови"), edited
-- from the admin dashboard (Ценовник). Marketing copy only: free text for the
-- price and a checklist of what the buyer gets. Independent of `plans` /
-- `plan_features` (0048), which decide what a venue or event can actually do.

begin;

create table public.pricing_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  price text not null check (char_length(btrim(price)) between 1 and 40),
  period text check (period is null or char_length(period) <= 40),
  features text[] not null default '{}' check (
    cardinality(features) <= 12
    and char_length(array_to_string(features, '')) <= 1440
  ),
  is_featured boolean not null default false,
  is_published boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pricing_cards enable row level security;
revoke all on public.pricing_cards from anon, authenticated;
grant all on public.pricing_cards to service_role;

-- The three cards the landing page showed before this table existed.
insert into public.pricing_cards (name, price, period, features, is_featured, sort_order) values
  ('Основен', '1.500 ден', '/ месечно',
   array['1 локал', 'До 2 простории', 'Управување со настани', 'Резервации', 'Распоред на маси'],
   false, 10),
  ('Про', '3.500 ден', '/ месечно',
   array['Сè од Основен', 'Менија и пакети', 'Буџет и чеклиста за парови', 'Дигитални покани со QR код', 'Известувања (наскоро)'],
   true, 20),
  ('Премиум', 'По договор', null,
   array['Сè од Про', 'Брендирање по мерка на локалот', 'Извештаи и аналитика', 'Приоритетна поддршка'],
   false, 30);

commit;
