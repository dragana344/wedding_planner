-- 0004 only granted venue staff a select policy on venues (read own venue).
-- There was no update policy, so renaming a venue silently affected zero rows.
create policy "venue staff update own venue" on venues
  for update using (is_venue_staff_for(id)) with check (is_venue_staff_for(id));
