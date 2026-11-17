import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listAdminTasks, listAdmins } from "@/lib/admin/queries";
import { AdminTasksTable, CreateAdminTaskForm } from "@/components/admin/AdminTasks";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "all", label: "Сите" },
  { key: "mine", label: "Доделени на мене" },
  { key: "sent", label: "Испратени од мене" },
] as const;

const EMPTY: Record<(typeof VIEWS)[number]["key"], string> = {
  all: "Нема задачи.",
  mine: "Немате задачи.",
  sent: "Сè уште немате испратено задача.",
};

// Internal tasks between admins (0150). Venue and couple tickets live in the
// inbox (/admin/messages) instead.
export default async function AdminTasksPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string }> }) {
  await requireAdmin({ page: true });
  // Same per-request cached check as the gate above; this one is for the id.
  const ctx = await requireAdmin();
  const { view: rawView, status } = await searchParams;
  const view = VIEWS.find((v) => v.key === rawView)?.key ?? "all";
  const [tasks, admins] = await Promise.all([listAdminTasks(ctx.adminUserId, { view, status }), listAdmins()]);
  const href = (key: string, s?: string) => `/admin/support?view=${key}${s ? `&status=${s}` : ""}`;

  return (
    <div className="wrap">
      <CreateAdminTaskForm admins={admins.filter((a) => a.id !== ctx.adminUserId)} />

      <div className="bar">
        <nav className="seg" aria-label="Приказ">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href(v.key, status)} aria-current={v.key === view ? "page" : undefined}>
              {v.label}
            </Link>
          ))}
        </nav>
        <form style={{ display: "flex", gap: 8 }} aria-label="Филтер на задачи">
          <input type="hidden" name="view" value={view} />
          <select className="fld" name="status" defaultValue={status ?? ""} aria-label="Статус">
            <option value="">Сите статуси</option>
            <option value="new">Нови</option>
            <option value="in_progress">Во тек</option>
            <option value="done">Решени</option>
          </select>
          <button className="btn btn-gold" type="submit">
            Филтрирај
          </button>
        </form>
      </div>

      <section className="panel">{tasks.length === 0 ? <p className="s1-empty">{EMPTY[view]}</p> : <AdminTasksTable tasks={tasks} />}</section>
    </div>
  );
}
