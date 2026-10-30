-- 0123: staff could not delete a standard package that any event uses.
--
-- Deleting a menu_templates row (staff, through RLS) cascades to its
-- event_menu_templates links, whose after-delete trigger (0119) clears the
-- guests' counts for the unlinked menu. That trigger ran with the staff
-- session's rights, and staff hold no privileges on event_guest_menu_counts
-- (couple/guest data is reached only through server routes), so the whole
-- delete failed with "permission denied". The trigger now runs as its owner;
-- it only ever deletes counts for the exact (event, menu) pair being unlinked.

begin;

alter function public.delete_counts_for_unlinked_menu() security definer;
revoke all on function public.delete_counts_for_unlinked_menu() from public, anon, authenticated;

commit;
