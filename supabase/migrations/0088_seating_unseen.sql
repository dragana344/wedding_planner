-- The couple can re-confirm their seating layout after editing it (it no
-- longer takes an unconfirm-then-confirm dance), and the venue now sees a
-- dot next to the event in their list until they actually open that event's
-- seating and look at the change.
alter table events add column seating_unseen_at timestamptz;
