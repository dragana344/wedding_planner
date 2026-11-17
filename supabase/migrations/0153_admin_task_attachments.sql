-- 0153: photo/PDF attachments on internal admin tickets (admin_tasks),
-- allowed on the ticket itself and on each comment in its thread. Same
-- "admin curates, no DB cleanup trigger" shape as vendor_partners' photo
-- arrays (0142): the admin action that deletes a task removes its own and
-- its comments' storage objects explicitly
-- (lib/admin/task-attachments.ts, lib/admin/task-actions-core.ts).

begin;

alter table public.admin_tasks
  add column attachment_paths text[] not null default '{}' check (cardinality(attachment_paths) <= 5);

alter table public.admin_task_comments
  add column attachment_paths text[] not null default '{}' check (cardinality(attachment_paths) <= 5);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('admin-task-attachments', 'admin-task-attachments', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
