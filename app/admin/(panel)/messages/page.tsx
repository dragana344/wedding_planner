import { requireAdmin } from "@/lib/admin/guard";
import { listMessages } from "@/lib/admin/queries";
import { MessagesTable } from "@/components/admin/MessagesTable";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin({ page: true });
  const { status } = await searchParams;
  const messages = await listMessages({ status });
  return (
    <div className="wrap">
      <form className="bar" aria-label="Филтер на пораки">
        <select className="fld" name="status" defaultValue={status ?? ""} aria-label="Статус">
          <option value="">Сите статуси</option>
          <option value="new">Нови</option>
          <option value="read">Прочитани</option>
          <option value="answered">Одговорени</option>
        </select>
        <button className="btn btn-gold" type="submit">
          Филтрирај
        </button>
      </form>

      {messages.length === 500 ? <p className="muted">Прикажани се последните 500.</p> : null}

      <section className="panel">
        {messages.length === 0 ? <p className="s1-empty">Нема пораки што одговараат на филтерот.</p> : <MessagesTable messages={messages} />}
      </section>
    </div>
  );
}
