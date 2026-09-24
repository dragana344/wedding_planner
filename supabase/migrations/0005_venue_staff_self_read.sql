-- Every venue-panel page reads venue_staff (via the request-scoped, RLS-bound
-- client) to resolve the logged-in staff member's venue_id. 0004 granted
-- venue_staff only to service_role and enabled RLS with zero policies, so
-- that lookup always returned nothing for real staff sessions. This adds a
-- narrow self-read: a signed-in user may read only their own staff row.
grant select on venue_staff to authenticated;

create policy "staff reads own staff row" on venue_staff
  for select using (user_id = auth.uid());
