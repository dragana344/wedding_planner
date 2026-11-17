import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_ATTACHMENTS, TOO_MANY_ATTACHMENTS_ERROR, removeTaskAttachments, uploadTaskAttachment } from "@/lib/admin/task-attachments";

// Core logic for the internal admin-task Server Actions (0150), kept apart
// from app/admin/(panel)/support/actions.ts so it can be exercised directly
// from a DB test — same convention as lib/admin/message-actions-core.ts.
//
// Who may do what:
//   - status (Во тек / Решено / reopen): the assignee only. A task sent to
//     every admin (assigned_to null) can be started by any admin except the
//     one who sent it, and starting it makes them the assignee.
//   - comments: any admin.
//   - delete: any admin (the sender, the receiver, or anyone else on the team —
//     a task sent from another admin's account must be removable too).

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

/** Photo/PDF attachments (0153), on the task itself and on each comment. */
const files = z.array(z.instanceof(File)).max(MAX_ATTACHMENTS, TOO_MANY_ATTACHMENTS_ERROR).default([]);

export const adminTaskSchemas = {
  create: z.object({
    title: z.string().trim().min(1, "Внесете наслов.").max(200, "Насловот е предолг."),
    description: z.string().trim().max(5000, "Описот е предолг.").default(""),
    /** null = every admin. */
    assignedTo: z.string().uuid().nullable(),
    files,
  }),
  setStatus: z.object({ id: taskId, status: z.enum(["new", "in_progress", "done"]) }),
  comment: z.object({ id: taskId, body: z.string().trim().min(1, "Внесете коментар.").max(5000, "Коментарот е предолг."), files }),
  id: z.object({ id: taskId }),
};

/** Uploads each file in order; on any failure (bad type, too large, a
 * storage error), removes whatever this batch already uploaded and rethrows
 * — a task/comment is never created with only some of its attachments.
 * `files` is undefined, not `[]`, for a caller that bypasses the schema's
 * own default — a direct core.create/core.comment call, as the DB tests do. */
async function uploadAll(fileList: File[] | undefined): Promise<string[]> {
  const list = fileList ?? [];
  // The schema's own .max() only runs through adminAction's schema.parse();
  // re-checked here so a direct core call (every DB test; a future caller
  // that skips the Server Action) gets the same message, not a raw
  // check-constraint error from the insert.
  if (list.length > MAX_ATTACHMENTS) throw new Error(TOO_MANY_ATTACHMENTS_ERROR);
  const paths: string[] = [];
  try {
    for (const file of list) paths.push(await uploadTaskAttachment(file));
  } catch (err) {
    await removeTaskAttachments(paths);
    throw err;
  }
  return paths;
}

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

// `files` optional here (unlike the schemas above, where it defaults to []):
// a caller that skips adminAction's schema.parse() — every DB test calls
// these core functions directly — never gets that default applied.
type CreateInput = Omit<z.infer<typeof adminTaskSchemas.create>, "files"> & { files?: File[] };
type CommentInput = Omit<z.infer<typeof adminTaskSchemas.comment>, "files"> & { files?: File[] };

export const adminTaskActionCore = {
  async create(i: CreateInput, ctx: AdminContext) {
    if (i.assignedTo !== null) {
      if (i.assignedTo === ctx.adminUserId) throw new Error("Задачата се праќа на друг админ.");
      const { data, error } = await db().auth.admin.getUserById(i.assignedTo);
      if (error || data.user?.app_metadata?.role !== "platform_admin") throw new Error("Избраниот примач не е админ.");
    }
    const attachmentPaths = await uploadAll(i.files);
    const { data, error } = await db()
      .from("admin_tasks")
      .insert({ title: i.title, description: i.description, assigned_to: i.assignedTo, created_by: ctx.adminUserId, attachment_paths: attachmentPaths })
      .select("id")
      .single();
    if (error) {
      await removeTaskAttachments(attachmentPaths);
      throw error;
    }
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

  async comment(i: CommentInput, ctx: AdminContext) {
    const task = await loadTask(i.id);
    const attachmentPaths = await uploadAll(i.files);
    const { error: commentError } = await db()
      .from("admin_task_comments")
      .insert({ task_id: i.id, author_id: ctx.adminUserId, body: i.body, attachment_paths: attachmentPaths });
    if (commentError) {
      await removeTaskAttachments(attachmentPaths);
      throw commentError;
    }
    // Flag the other side as having something new to read; a pooled,
    // unclaimed task (assigned_to null) has no specific assignee to flag yet.
    await check(
      db()
        .from("admin_tasks")
        .update({
          updated_at: new Date().toISOString(),
          ...(ctx.adminUserId !== task.created_by ? { created_by_unread: true } : {}),
          ...(task.assigned_to !== null && ctx.adminUserId !== task.assigned_to ? { assigned_to_unread: true } : {}),
        })
        .eq("id", i.id),
    );
    revalidate();
    return { data: null, audit: { action: "admin_task_comment", targetId: i.id } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(i: z.infer<typeof adminTaskSchemas.id>, _ctx: AdminContext) {
    await loadTask(i.id); // "not found" before touching storage
    // Comments cascade-delete with the task (0150's FK), but their storage
    // files don't — remove those explicitly first, same as the task's own.
    const [{ data: taskRow, error: taskReadError }, { data: comments, error: commentsReadError }] = await Promise.all([
      db().from("admin_tasks").select("attachment_paths").eq("id", i.id).single(),
      db().from("admin_task_comments").select("attachment_paths").eq("task_id", i.id),
    ]);
    if (taskReadError) throw taskReadError;
    if (commentsReadError) throw commentsReadError;
    const allPaths = [...taskRow.attachment_paths, ...(comments ?? []).flatMap((c) => c.attachment_paths as string[])];
    await removeTaskAttachments(allPaths);
    await check(db().from("admin_tasks").delete().eq("id", i.id));
    revalidate();
    return { data: null, audit: { action: "admin_task_deleted", targetId: i.id } };
  },
};
