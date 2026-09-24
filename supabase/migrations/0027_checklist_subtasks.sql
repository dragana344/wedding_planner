-- Subtasks under a checklist item — e.g. listing the photographer options
-- being considered under "Find photographer" before the couple checks the
-- parent task off. Independent of the parent's is_done; checking subtasks
-- off never auto-completes the parent. Same access pattern as every other
-- couple-facing table: RLS enabled with zero anon/authenticated policies,
-- service_role only.

create table event_checklist_subtasks (
  id uuid primary key default gen_random_uuid(),
  checklist_item_id uuid not null references event_checklist_items(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index event_checklist_subtasks_item_id_idx on event_checklist_subtasks(checklist_item_id);

alter table event_checklist_subtasks enable row level security;

grant all on event_checklist_subtasks to service_role;
