-- 0113: track which staff member (waiter/barista) took each reservation —
-- the Резервации page's "Нова резервација" form now has a "Келнер" field so
-- the venue can trace a booking back to who made it.
--
-- Nullable, not enforced at the database level: older rows and the several
-- DB-test suites that insert reservations directly for unrelated scenarios
-- (conflict detection, RLS isolation, etc.) never set this column, and there
-- is no reason to force a placeholder value onto them. The React form is
-- where this is actually required — see ReservationsClient.tsx.

alter table public.reservations add column server_name text;
