import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Core logic for the internal admin-task Server Actions (0150), kept apart
// from app/admin/(panel)/support/actions.ts so it can be exercised directly
// from a DB test — same convention as lib/admin/message-actions-core.ts.
//
// Who may do what:
//   - status (Во тек / Решено / reopen): the assignee only. A task sent to
//     every admin (assigned_to null) can be started by any admin except the
//     one who sent it, and starting it makes them the assignee.
//   - comments: any admin.
//   - delete: the admin who sent it.

const db = () => createServiceRoleClient();
// The layout, not just the page: the sidebar's task count changes too.
const revalidate = () => {
  try {
    revalidatePath("/admin", "layout");
  } catch {
    /* outside a request (tests) */
  }
};
async function check(p: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await p;
  if (error) throw error;
}

const taskId = z.string().uuid();
const NOT_FOUND = "Задачата не е пронајдена.";

export const adminTaskSchemas = {
  create: z.object({
    title: z.string().trim().min(1, "Внесете наслов.").max(200, "Насловот е предолг."),
    description: z.string().trim().max(5000, "Описот е предолг.").default(""),
    /** null = every admin. */
    assignedTo: z.string().uuid().nullable(),
  }),
  setStatus: z.object({ id: taskId, status: z.enum(["new", "in_progress", "done"]) }),
  comment: z.object({ id: taskId, body: z.string().trim().min(1, "Внесете коментар.").max(5000, "Коментарот е предолг.") }),
  id: z.object({ id: taskId }),
};

type TaskOwnership = { created_by: string | null; assigned_to: string | null };

async function loadTask(id: string): Promise<TaskOwnership> {
  const { data, error } = await db().from("admin_tasks").select("created_by, assigned_to").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(NOT_FOUND);
  return data as TaskOwnership;
}

export function canChangeTaskStatus(task: TaskOwnership, adminUserId: string): boolean {
  return task.assigned_to === null ? task.created_by !== adminUserId : task.assigned_to === adminUserId;
}

export const adminTaskActionCore = {
  async create(i: z.infer<typeof adminTaskSchemas.create>, ctx: AdminContext) {
    if (i.assignedTo !== null) {
      if (i.assignedTo === ctx.adminUserId) throw new Error("Задачата се праќа на друг админ.");
      const { data, error } = await db().auth.admin.getUserById(i.assignedTo);
      if (error || data.user?.app_metadata?.role !== "platform_admin") throw new Error("Избраниот примач не е админ.");
    }
    const { data, error } = await db()
      .from("admin_tasks")
      .insert({ title: i.title, description: i.description, assigned_to: i.assignedTo, created_by: ctx.adminUserId })
      .select("id")
      .single();
    if (error) throw error;
    revalidate();
    // Title/description stay out of the audit row (constraints.md: no free text in audit details).
    return { data: { id: data.id as string }, audit: { action: "admin_task_created", targetId: data.id, details: { to_everyone: i.assignedTo === null } } };
  },

  async setStatus(i: z.infer<typeof adminTaskSchemas.setStatus>, ctx: AdminContext) {
    const task = await loadTask(i.id);
    if (!canChangeTaskStatus(task, ctx.adminUserId)) throw new Error("Статусот го менува админот што ја доби задачата.");
    const now = new Date().toISOString();
    await check(
      db()
        .from("admin_tasks")
        .update({
          status: i.status,
          updated_at: now,
          completed_at: i.status === "done" ? now : null,
          // Starting or finishing an open task claims it.
          ...(task.assigned_to === null && i.status !== "new" ? { assigned_to: ctx.adminUserId } : {}),
        })
        .eq("id", i.id)
    );
    revalidate();
    return { data: null, audit: { action: "admin_task_status", targetId: i.id, details: { status: i.status } } };
  },

  async comment(i: z.infer<typeof adminTaskSchemas.comment>, ctx: AdminContext) {
    await loadTask(i.id);
    await check(db().from("admin_task_comments").insert({ task_id: i.id, author_id: ctx.adminUserId, body: i.body }));
    await check(db().from("admin_tasks").update({ updated_at: new Date().toISOString() }).eq("id", i.id));
    revalidate();
    return { data: null, audit: { action: "admin_task_comment", targetId: i.id } };
  },

  async remove(i: z.infer<typeof adminTaskSchemas.id>, ctx: AdminContext) {
    const task = await loadTask(i.id);
    if (task.created_by !== ctx.adminUserId) throw new Error("Задачата може да ја избрише само админот што ја испратил.");
    await check(db().from("admin_tasks").delete().eq("id", i.id));
    revalidate();
    return { data: null, audit: { action: "admin_task_deleted", targetId: i.id } };
  },
};
