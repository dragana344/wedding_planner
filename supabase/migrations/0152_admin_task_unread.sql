-- 0152: per-side "someone replied since you last looked" flag on admin_tasks,
-- same two-boolean shape as support_tickets' awaiting_admin/requester_unread
-- (0150) but for the two fixed roles on a task (sender vs assignee) instead
-- of (admin vs requester). A comment from one side flips the other side's
-- flag on; viewing the task (lib/admin/queries.ts getAdminTask) clears your
-- own side. Feeds the sidebar's existing "tasks" badge (lib/admin/queries.ts
-- getAdminBadgeCounts) so a reply on a task you already started shows up
-- there too, not just brand-new tasks.

begin;

alter table public.admin_tasks
  add column created_by_unread boolean not null default false,
  add column assigned_to_unread boolean not null default false;

commit;
