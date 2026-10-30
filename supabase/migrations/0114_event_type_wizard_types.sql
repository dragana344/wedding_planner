-- 0114: the redesigned "Нов настан" wizard offers 15 event types instead of
-- the original 6 (0014) — widen the CHECK constraint on events.event_type
-- (and reservations.event_type, which has always mirrored the same list) to
-- match. Both constraints were created inline with their default
-- Postgres-generated names, never renamed since.

begin;

alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in (
  'wedding', 'birthday', 'baptism', 'graduation', 'corporate', 'anniversary', 'family',
  'conference', 'presentation', 'seminar', 'team_building', 'new_year', 'school', 'baby_shower', 'other'
));

alter table public.reservations drop constraint reservations_event_type_check;
alter table public.reservations add constraint reservations_event_type_check check (event_type is null or event_type in (
  'wedding', 'birthday', 'baptism', 'graduation', 'corporate', 'anniversary', 'family',
  'conference', 'presentation', 'seminar', 'team_building', 'new_year', 'school', 'baby_shower', 'other'
));

commit;
