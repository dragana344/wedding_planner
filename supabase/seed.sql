-- Synthetic data for local development and staging (DATA-010). Loaded by
-- `supabase db reset`. Every name, phone and email here is invented; never
-- replace this with a copy of production data.
--
--   Venue staff login:  demo@example.com / demo-password-123   (/login)
--   Couple login:       demo-couple / demo-couple-123          (/couple/login)
--   Floor-plan lock:    1234

-- ---------------------------------------------------------------------------
-- Venue staff user
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'demo@example.com', extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
  jsonb_build_object('sub', 'd0000000-0000-4000-8000-000000000001', 'email', 'demo@example.com', 'email_verified', true),
  'email', now(), now(), now()
);

-- ---------------------------------------------------------------------------
-- Venue, rooms, tables
-- ---------------------------------------------------------------------------
insert into public.venues (id, name, layout_lock_password_hash)
values ('d0000000-0000-4000-8000-0000000000a1', 'Демо Сала Езеро', extensions.crypt('1234', extensions.gen_salt('bf')));

insert into public.venue_staff (user_id, venue_id)
values ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a1');

insert into public.rooms (id, venue_id, name, width_cm, height_cm) values
  ('d0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000a1', 'Голема сала', 2400, 1600),
  ('d0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000a1', 'Тераса', 1600, 1000);

insert into public.table_types (id, room_id, name, shape, seats, width_cm, length_cm, quantity) values
  ('d0000000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000b1', 'Тркалезна 10', 'round', 10, 180, 180, 12),
  ('d0000000-0000-4000-8000-0000000000c2', 'd0000000-0000-4000-8000-0000000000b1', 'Правоаголна 8', 'rectangular', 8, 90, 220, 6),
  ('d0000000-0000-4000-8000-0000000000c3', 'd0000000-0000-4000-8000-0000000000b2', 'Тркалезна 6', 'round', 6, 140, 140, 8);

-- A 4 x 3 grid of round tables in the main hall and a row on the terrace.
insert into public.room_layout_elements (room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm, label)
select 'd0000000-0000-4000-8000-0000000000b1', 'table', 'd0000000-0000-4000-8000-0000000000c1',
       300 + (i % 4) * 450, 300 + (i / 4) * 400, 180, 180, 'Маса ' || (i + 1)
from generate_series(0, 11) as i;

insert into public.room_layout_elements (room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm, label)
select 'd0000000-0000-4000-8000-0000000000b2', 'table', 'd0000000-0000-4000-8000-0000000000c3',
       200 + i * 250, 400, 140, 140, 'Т' || (i + 1)
from generate_series(0, 5) as i;

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
insert into public.menu_items (id, venue_id, tiers, course, name, price, is_vegetarian) values
  ('d0000000-0000-4000-8000-0000000000d1', 'd0000000-0000-4000-8000-0000000000a1', array['everyday','special'], 'starter', 'Шопска салата', 180, true),
  ('d0000000-0000-4000-8000-0000000000d2', 'd0000000-0000-4000-8000-0000000000a1', array['special'], 'starter', 'Пршута и сирења', 420, false),
  ('d0000000-0000-4000-8000-0000000000d3', 'd0000000-0000-4000-8000-0000000000a1', array['everyday','special'], 'main', 'Пастрмка на скара', 650, false),
  ('d0000000-0000-4000-8000-0000000000d4', 'd0000000-0000-4000-8000-0000000000a1', array['special'], 'main', 'Телешко печено', 890, false),
  ('d0000000-0000-4000-8000-0000000000d5', 'd0000000-0000-4000-8000-0000000000a1', array['everyday'], 'main', 'Полнети пиперки', 480, true),
  ('d0000000-0000-4000-8000-0000000000d6', 'd0000000-0000-4000-8000-0000000000a1', array['everyday','special'], 'dessert', 'Баклава', 220, true);

insert into public.menu_templates (id, venue_id, name, description) values
  ('d0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000a1', 'Класично свадбено мени', 'Три слеја, риба и месо');

insert into public.menu_template_items (menu_template_id, menu_item_id)
select 'd0000000-0000-4000-8000-0000000000e1', id
from public.menu_items
where id in ('d0000000-0000-4000-8000-0000000000d1', 'd0000000-0000-4000-8000-0000000000d3',
             'd0000000-0000-4000-8000-0000000000d4', 'd0000000-0000-4000-8000-0000000000d6');

-- ---------------------------------------------------------------------------
-- Events: one fully planned wedding for the demo couple, plus a year of
-- other bookings so lists, calendars and reports have realistic volume.
-- ---------------------------------------------------------------------------
insert into public.events (id, venue_id, couple_names, event_date, start_time, end_time, event_type, status, guest_count_estimate,
                           menu_template_id, contact_email, contact_phone, total_price, deposit_paid)
values ('d0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000a1', 'Ана и Марко',
        current_date + 60, '19:00', '02:00', 'wedding', 'confirmed', 120,
        'd0000000-0000-4000-8000-0000000000e1', 'ana.marko@example.com', '+389 70 000 001', 540000, 150000);

insert into public.event_rooms (event_id, room_id)
values ('d0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000b1');

insert into public.events (venue_id, couple_names, event_date, start_time, end_time, event_type, status, guest_count_estimate)
select 'd0000000-0000-4000-8000-0000000000a1',
       (array['Елена и Давид','Марија и Стефан','Сара и Никола','Ива и Бојан','Теа и Филип','Нина и Петар'])[1 + i % 6],
       current_date - 120 + i * 9,
       '18:00', '01:00',
       (array['wedding','wedding','birthday','baptism','graduation','corporate'])[1 + i % 6],
       case when current_date - 120 + i * 9 < current_date then 'completed' else (array['preparation','confirmed'])[1 + i % 2] end,
       60 + (i * 37) % 180
from generate_series(1, 40) as i;

insert into public.event_rooms (event_id, room_id)
select e.id, case when row_number() over (order by e.event_date) % 3 = 0 then 'd0000000-0000-4000-8000-0000000000b2'::uuid
                  else 'd0000000-0000-4000-8000-0000000000b1'::uuid end
from public.events e
where e.venue_id = 'd0000000-0000-4000-8000-0000000000a1' and e.id <> 'd0000000-0000-4000-8000-0000000000f1';

-- ---------------------------------------------------------------------------
-- The demo couple's planning data
-- ---------------------------------------------------------------------------
select public.create_event_credentials('d0000000-0000-4000-8000-0000000000f1', 'demo-couple', 'demo-couple-123');

insert into public.event_guests (event_id, full_name, phone, party_size, rsvp_status, side)
select 'd0000000-0000-4000-8000-0000000000f1',
       (array['Александар','Бисера','Васил','Горан','Даниела','Ѓорѓи','Елена','Жарко','Зоран','Ивана','Јана','Кирил','Љубица','Марјан','Невена'])[1 + i % 15]
         || ' ' ||
       (array['Петровски','Николовска','Трајковски','Стојановска','Илиевски','Јованоска','Георгиевски','Димитровска'])[1 + (i * 7) % 8],
       '+389 7' || (i % 10) || ' 000 ' || lpad(i::text, 3, '0'),
       1 + (i % 3),
       (array['invited','confirmed','confirmed','declined','pending'])[1 + i % 5],
       (array['bride','groom'])[1 + i % 2]
from generate_series(1, 80) as i;

insert into public.event_budget_items (event_id, category, name, estimated_amount, paid_amount) values
  ('d0000000-0000-4000-8000-0000000000f1', 'catering', 'Сала и мени', 540000, 150000),
  ('d0000000-0000-4000-8000-0000000000f1', 'photography', 'Фотограф', 60000, 20000),
  ('d0000000-0000-4000-8000-0000000000f1', 'music_entertainment', 'Бенд', 90000, 0),
  ('d0000000-0000-4000-8000-0000000000f1', 'flowers_decor', 'Цвеќиња и декорација', 45000, 10000);

insert into public.event_checklist_items (event_id, title, due_date, is_done) values
  ('d0000000-0000-4000-8000-0000000000f1', 'Резервирај фотограф', current_date - 30, true),
  ('d0000000-0000-4000-8000-0000000000f1', 'Испрати покани', current_date + 10, false),
  ('d0000000-0000-4000-8000-0000000000f1', 'Проба на фризура', current_date + 50, false);

insert into public.event_agenda_items (event_id, title, time, sort_order) values
  ('d0000000-0000-4000-8000-0000000000f1', 'Пречек на гостите', '19:00', 1),
  ('d0000000-0000-4000-8000-0000000000f1', 'Прв танц', '21:00', 2),
  ('d0000000-0000-4000-8000-0000000000f1', 'Торта', '23:30', 3);

insert into public.event_invitations (event_id, template_id, message, public_slug)
values ('d0000000-0000-4000-8000-0000000000f1', 'romantic-floral', 'Со радост ве покануваме на нашата свадба!', 'demo-invite');

-- ---------------------------------------------------------------------------
-- Terrace reservations over the coming weeks
-- ---------------------------------------------------------------------------
insert into public.reservations (venue_id, room_id, guest_name, phone, date, start_time, end_time, party_size, status)
select 'd0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000b2',
       (array['Тодор','Марта','Лазар','Симона','Виктор'])[1 + i % 5] || ' (демо)',
       '+389 71 111 ' || lpad(i::text, 3, '0'),
       current_date + (i / 3), (array['12:00','16:00','20:00'])[1 + i % 3]::time, null,
       2 + i % 5, 'reserved'
from generate_series(0, 29) as i;

insert into public.reservation_tables (reservation_id, layout_element_id)
select r.id, t.id
from (select id, row_number() over (order by date, start_time) - 1 as n from public.reservations
      where venue_id = 'd0000000-0000-4000-8000-0000000000a1') r
join (select id, row_number() over (order by x_cm) - 1 as n from public.room_layout_elements
      where room_id = 'd0000000-0000-4000-8000-0000000000b2') t on t.n = r.n % 6;
