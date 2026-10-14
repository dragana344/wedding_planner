import { requireAdmin } from "@/lib/admin/guard";
import { listSupportTickets } from "@/lib/admin/queries";
import { SupportTicketsTable } from "@/components/admin/SupportTicketsTable";

export const dynamic = "force-dynamic";

export default async function SupportTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin({ page: true });
  const { status } = await searchParams;
  const tickets = await listSupportTickets({ status });
  return (
    <div className="wrap">
      <form className="bar" aria-label="Филтер на барања">
        <select className="fld" name="status" defaultValue={status ?? ""} aria-label="Статус">
          <option value="">Сите статуси</option>
          <option value="pending">Во очекување</option>
          <option value="done">Завршени</option>
        </select>
        <button className="btn btn-gold" type="submit">
          Филтрирај
        </button>
      </form>

      {tickets.length === 500 ? <p className="muted">Прикажани се последните 500.</p> : null}

      <section className="panel">
        {tickets.length === 0 ? <p className="s1-empty">Нема барања што одговараат на филтерот.</p> : <SupportTicketsTable tickets={tickets} />}
      </section>
    </div>
  );
}
