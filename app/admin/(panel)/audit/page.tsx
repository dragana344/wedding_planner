import { requireAdmin } from "@/lib/admin/guard";
import Link from "next/link";
import { listAudit } from "@/lib/admin/queries";
import { VENUE_TIME_ZONE } from "@/lib/date";
import { parseAuditFilters, startOfDaySkopjeIso, endOfDaySkopjeIso, type AuditSearchParams, type AuditFilters } from "@/lib/admin/audit-filters";

export const dynamic = "force-dynamic";

const ACTOR_TYPES = ["admin", "staff", "couple", "guest", "system"] as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("mk-MK", { timeZone: VENUE_TIME_ZONE });
}

// Builds a /admin/audit?... link that carries only the *validated* filters
// (never raw/invalid query-string junk) plus the target page.
function pagerLink(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.venueId) params.set("venue", filters.venueId);
  if (filters.eventId) params.set("event", filters.eventId);
  if (filters.action) params.set("action", filters.action);
  if (filters.actorType) params.set("actor", filters.actorType);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(page));
  return `/admin/audit?${params.toString()}`;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditSearchParams> }) {
  await requireAdmin({ page: true });
  const filters = parseAuditFilters(await searchParams);
  const { rows, hasMore } = await listAudit({
    venueId: filters.venueId,
    eventId: filters.eventId,
    action: filters.action,
    actorType: filters.actorType,
    from: filters.from ? startOfDaySkopjeIso(filters.from) : undefined,
    to: filters.to ? endOfDaySkopjeIso(filters.to) : undefined,
    page: filters.page,
  });

  return (
    <div className="wrap">
      {/* defaultValues come from the *validated* filters, not raw
          searchParams: an invalid/dropped value (a bad UUID, an unknown
          actor, a nonsense date) never gets echoed back into the form. */}
      <form className="bar" aria-label="Филтер на audit log">
        <input className="fld" name="action" defaultValue={filters.action} placeholder="Акција" aria-label="Акција" />
        <select className="fld" name="actor" defaultValue={filters.actorType ?? ""} aria-label="Актер">
          <option value="">Сите актери</option>
          {ACTOR_TYPES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input className="fld" name="venue" defaultValue={filters.venueId} placeholder="ID на локал" aria-label="ID на локал" />
        <input className="fld" name="event" defaultValue={filters.eventId} placeholder="ID на настан" aria-label="ID на настан" />
        <input type="date" className="fld" name="from" defaultValue={filters.from} aria-label="Од датум" />
        <input type="date" className="fld" name="to" defaultValue={filters.to} aria-label="До датум" />
        <button className="btn btn-gold" type="submit">
          Филтрирај
        </button>
      </form>

      <section className="panel">
        {rows.length === 0 ? (
          <p className="s1-empty">Нема записи што одговараат на филтерот.</p>
        ) : (
          <table className="s1-tbl">
            <thead>
              <tr>
                <th>Време</th>
                <th>Актер</th>
                <th>Акција</th>
                <th>Локал</th>
                <th>Настан</th>
                <th>Детали</th>
                <th>Request</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.occurredAt)}</td>
                  <td>{r.actorType}</td>
                  <td>{r.action}</td>
                  <td>{r.venueId ? <Link href={`/admin/venues/${r.venueId}`}>локал</Link> : "—"}</td>
                  <td>{r.eventId ? <Link href={`/admin/events/${r.eventId}`}>настан</Link> : "—"}</td>
                  <td>
                    <code>{JSON.stringify(r.details)}</code>
                  </td>
                  <td>
                    <code>{r.requestId ?? "—"}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filters.page > 0 || hasMore ? (
          <div className="foot">
            <div className="pager">
              {filters.page > 0 ? (
                <Link className="pg" href={pagerLink(filters, filters.page - 1)}>
                  Претходна
                </Link>
              ) : null}
              {hasMore ? (
                <Link className="pg" href={pagerLink(filters, filters.page + 1)}>
                  Следна
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
