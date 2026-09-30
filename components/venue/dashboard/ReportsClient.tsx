import { STATUS_META, TYPE_META } from "@/lib/venue/event-display";
import type { ReportData, ReportFilters } from "@/lib/venue/reports";

const MONTH = new Intl.DateTimeFormat("mk-MK", { month: "long", year: "numeric", timeZone: "UTC" });
const NUMBER = new Intl.NumberFormat("de-DE"); // 230.000 — the dot grouping used for денари

function monthLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`)).replace(/\s*г\.?$/, "");
}

function money(n: number): string {
  return `${NUMBER.format(Math.round(n))} ден`;
}

/** One series (count per category), so one hue; every bar carries its label and value. */
function Bars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="s3-bars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.count}`}>
          <span className="s3-bar-label">{r.label}</span>
          <span className="s3-bar-track">
            <span className="s3-bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="s3-bar-num">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Извештаи (B9): period and hall filter (plain GET form), totals, months, types, statuses, fill per hall. */
export function ReportsClient({
  report,
  rooms,
  filters,
}: {
  report: ReportData;
  rooms: { id: string; name: string }[];
  filters: ReportFilters;
}) {
  const { totals } = report;
  return (
    <div className="wrap">
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Извештаи</h2>
        </div>
        <form method="get" className="s3-report-filter">
          <label className="lab-s">
            Од
            <input className="fld" type="date" name="from" defaultValue={filters.from} />
          </label>
          <label className="lab-s">
            До
            <input className="fld" type="date" name="to" defaultValue={filters.to} />
          </label>
          <label className="lab-s">
            Сала
            <select className="fld" name="room" defaultValue={filters.roomId ?? ""}>
              <option value="">Сите сали</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-gold">
            Прикажи
          </button>
        </form>
      </section>

      <section className="tiles" aria-label="Вкупно">
        <div className="tile">
          <div>
            <div className="num">{totals.events}</div>
            <div className="lab">Настани<span>во периодот</span></div>
          </div>
        </div>
        <div className="tile">
          <div>
            <div className="num">{NUMBER.format(totals.guests)}</div>
            <div className="lab">Гости<span>по проценка, без откажани</span></div>
          </div>
        </div>
        <div className="tile">
          <div>
            <div className="num">{money(totals.revenue)}</div>
            <div className="lab">Приход<span>договорена цена</span></div>
          </div>
        </div>
        <div className="tile">
          <div>
            <div className="num">{money(totals.deposits)}</div>
            <div className="lab">Капари<span>платено</span></div>
          </div>
        </div>
      </section>

      {totals.events === 0 ? (
        <section className="panel">
          <p className="ev-hint" style={{ padding: 20 }}>Нема настани во избраниот период.</p>
        </section>
      ) : (
        <div className="dash-grid">
          <section className="panel">
            <div className="panel-h">
              <h2 className="panel-t">По месец</h2>
            </div>
            <table className="s3-report-table" aria-label="По месец">
              <thead>
                <tr>
                  <th>Месец</th>
                  <th>Настани</th>
                  <th>Гости</th>
                  <th>Приход</th>
                  <th>Капари</th>
                </tr>
              </thead>
              <tbody>
                {report.byMonth.map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td>{m.events}</td>
                    <td>{NUMBER.format(m.guests)}</td>
                    <td>{money(m.revenue)}</td>
                    <td>{money(m.deposits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-h">
              <h2 className="panel-t">Пополнетост по сала</h2>
            </div>
            <table className="s3-report-table" aria-label="По сала">
              <thead>
                <tr>
                  <th>Сала</th>
                  <th>Настани</th>
                  <th>Места</th>
                  <th>Просечна пополнетост</th>
                </tr>
              </thead>
              <tbody>
                {report.byRoom.map((r) => (
                  <tr key={r.roomId}>
                    <td>{r.roomName}</td>
                    <td>{r.events}</td>
                    <td>{r.seatCapacity || "—"}</td>
                    <td>{r.avgFill == null ? "—" : `${Math.round(r.avgFill * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-h">
              <h2 className="panel-t">По вид</h2>
            </div>
            <Bars rows={report.byType.map((t) => ({ label: TYPE_META[t.type]?.label ?? t.type, count: t.count }))} />
          </section>

          <section className="panel">
            <div className="panel-h">
              <h2 className="panel-t">По статус</h2>
            </div>
            <Bars rows={report.byStatus.map((s) => ({ label: STATUS_META[s.status]?.label ?? s.status, count: s.count }))} />
          </section>
        </div>
      )}
    </div>
  );
}
