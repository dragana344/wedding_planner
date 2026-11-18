-- 0172: the platform admin's "delete venue" becomes a deletion scheduled
-- 15 days later (group A, task 3).
--
-- The admin sets deletion_scheduled_for = now() + 15 days (audited
-- 'venue_deletion_scheduled', lib/admin/venue-actions-core.ts) and can clear
-- it again ('venue_deletion_cancelled'). Meanwhile the venue panel shows the
-- date and asks the venue to download its data. The daily retention cron
-- (/api/cron/retention → runScheduledVenueDeletions() in
-- lib/privacy/retention.ts) then deletes every due venue through
-- delete_scheduled_venue() below, one venue per call, so one failure does
-- not stop the others. Couples keep their normal access until the venue is
-- actually gone.
--
-- Neither column is personal data: a date, and the admin's own user id.
-- Staff cannot write venues at all since 0107 (service-role only).

alter table public.venues
  add column deletion_scheduled_for timestamptz,
  add column deletion_scheduled_by uuid;

create index venues_deletion_scheduled_for_idx on public.venues (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

-- Deletes the venue only if its deletion is still scheduled and due. The row
-- lock taken here (and again inside delete_venue_account) makes an admin's
-- concurrent "cancel" either win before this runs (→ null, nothing deleted)
-- or wait until the venue is gone. Returns delete_venue_account's result
-- ({user_ids, events}) or null when nothing was deleted. The audit row is
-- delete_venue_account's own 'venue_account_deleted', actor 'system'.
create or replace function public.delete_scheduled_venue(p_venue_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  perform 1 from venues
  where id = p_venue_id and deletion_scheduled_for is not null and deletion_scheduled_for <= now()
  for update;
  if not found then
    return null;
  end if;
  return delete_venue_account(p_venue_id, null, null);
end;
$$;
revoke all on function public.delete_scheduled_venue(uuid) from public, anon, authenticated;
grant execute on function public.delete_scheduled_venue(uuid) to service_role;
