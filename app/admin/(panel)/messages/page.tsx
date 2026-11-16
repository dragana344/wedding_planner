import { requireAdmin } from "@/lib/admin/guard";
import { listInbox } from "@/lib/admin/queries";
import { InboxTable } from "@/components/admin/InboxTable";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ status?: string; source?: string }> }) {
  await requireAdmin({ page: true });
  const { status, source } = await searchParams;
  const rows = await listInbox({ status, source });
  return (
    <div className="wrap">
      <form className="bar" aria-label="Филтер на пораки">
        <select className="fld" name="source" defaultValue={source ?? ""} aria-label="Извор">
          <option value="">Сите извори</option>
          <option value="public">Јавна форма</option>
          <option value="venue">Локали</option>
          <option value="couple">Парови</option>
        </select>
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

      {rows.length === 500 ? <p className="muted">Прикажани се последните 500.</p> : null}

      <section className="panel">
        {rows.length === 0 ? <p className="s1-empty">Нема пораки што одговараат на филтерот.</p> : <InboxTable rows={rows} />}
      </section>
    </div>
  );
}
