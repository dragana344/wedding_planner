import { requireAdmin } from "@/lib/admin/guard";
import Link from "next/link";
import { Icon } from "@/components/venue/shell/Icon";
import { listEvents, listVenues } from "@/lib/admin/queries";
import { formatMkDate } from "@/lib/date";

export const dynamic = "force-dynamic";

const STATUSES: { value: string; label: string }[] = [
  { value: "preparation", label: "Подготовка" },
  { value: "confirmed", label: "Потврден" },
  { value: "in_progress", label: "Во тек" },
  { value: "completed", label: "Завршен" },
  { value: "cancelled", label: "Откажан" },
];

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string; from?: string; to?: string; status?: string }>;
}) {
  await requireAdmin({ page: true });
  const { venue, from, to, status } = await searchParams;
  const [events, venues] = await Promise.all([listEvents({ venueId: venue, from, to, status }), listVenues({})]);
  return (
    <div className="wrap">
      <form className="bar" aria-label="Филтер на настани">
        <select className="fld" name="venue" defaultValue={venue ?? ""} aria-label="Локал">
          <option value="">Сите локали</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <input type="date" className="fld" name="from" defaultValue={from} aria-label="Од датум" />
        <input type="date" className="fld" name="to" defaultValue={to} aria-label="До датум" />
        <select className="fld" name="status" defaultValue={status ?? ""} aria-label="Статус">
          <option value="">Сите статуси</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn btn-gold" type="submit">
          <Icon name="search" size="sm" /> Филтрирај
        </button>
      </form>

      <section className="panel">
        {events.length === 0 ? (
          <p className="s1-empty">Нема настани што одговараат на филтерот.</p>
        ) : (
          <table className="s1-tbl">
            <thead>
              <tr>
                <th>Датум</th>
                <th>Време</th>
                <th>Локал</th>
                <th>Пар</th>
                <th>Статус</th>
                <th>Гости (проценка)</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{formatMkDate(e.date)}</td>
                  <td>{e.startTime ? e.startTime.slice(0, 5) : "—"}</td>
                  <td>{e.venueName}</td>
                  <td>
                    <Link href={`/admin/events/${e.id}`}>{e.coupleNames}</Link>
                  </td>
                  <td>{STATUSES.find((s) => s.value === e.status)?.label ?? e.status}</td>
                  <td>{e.guestEstimate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
