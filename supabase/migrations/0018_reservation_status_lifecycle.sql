-- Replaces the negotiating/confirmed/cancelled status set with an
-- arrival-based lifecycle: reserved (booked, guests not here yet) -> seated
-- (guests physically at the table, set by staff) -> completed (guests left,
-- set by staff) -> cancelled (never happened). "confirmed" is folded into
-- "reserved" since nothing in the app ever set it.

alter table reservations drop constraint if exists reservations_status_check;

update reservations set status = 'reserved' where status in ('negotiating', 'confirmed');

alter table reservations alter column status set default 'reserved';
alter table reservations add constraint reservations_status_check
  check (status in ('reserved', 'seated', 'completed', 'cancelled'));
