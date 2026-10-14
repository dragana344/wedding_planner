import type { SupportTicket } from "@/lib/venue/support";
import { formatMkDate } from "@/lib/date";

const STATUS_LABEL: Record<SupportTicket["status"], string> = { pending: "Во очекување", done: "Завршено" };
const STATUS_VARIANT: Record<SupportTicket["status"], string> = { pending: "p-warn", done: "p-ok" };

/** Shared by the venue and couple dashboards: a read-only list of the
 * caller's own past tickets and their status. */
export function SupportTicketList({ tickets }: { tickets: SupportTicket[] }) {
  if (tickets.length === 0) return <p className="s1-empty">Нема испратени барања.</p>;
  return (
    <table className="s1-tbl">
      <thead>
        <tr>
          <th>Датум</th>
          <th>Проблем</th>
          <th>Статус</th>
          <th>Одговор од тимот</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => (
          <tr key={t.id}>
            <td>{formatMkDate(t.createdAt.slice(0, 10))}</td>
            <td>{t.problem}</td>
            <td>
              <span className={`pill ${STATUS_VARIANT[t.status]}`}>{STATUS_LABEL[t.status]}</span>
            </td>
            <td>{t.adminComment ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
