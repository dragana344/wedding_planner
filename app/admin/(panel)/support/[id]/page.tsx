import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getAdminTask } from "@/lib/admin/queries";
import { BackButton } from "@/components/admin/BackButton";
import { AdminTaskDetail } from "@/components/admin/AdminTasks";

export const dynamic = "force-dynamic";

// The same rule lib/admin/task-actions-core.ts enforces on the server:
// the assignee changes the status; a task sent to every admin can be taken
// by anyone except its sender.
function canChangeStatus(task: { createdBy: string | null; assignedTo: string | null }, adminUserId: string): boolean {
  return task.assignedTo === null ? task.createdBy !== adminUserId : task.assignedTo === adminUserId;
}

export default async function AdminTaskPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ page: true });
  // Same per-request cached check as the gate above; this one is for the id.
  const ctx = await requireAdmin();
  const { id } = await params;
  const found = await getAdminTask(id, ctx.adminUserId);
  if (!found) notFound();
  return (
    <div className="wrap">
      <BackButton label="Назад кон задачи" />
      <AdminTaskDetail
        task={found.task}
        comments={found.comments}
        currentAdminId={ctx.adminUserId}
        canChangeStatus={canChangeStatus(found.task, ctx.adminUserId)}
      />
    </div>
  );
}
