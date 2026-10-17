"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_META, TYPE_META } from "@/lib/venue/event-display";
import type { ReportData, ReportFilters } from "@/lib/venue/reports";
import { useManagerElevation, reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

const MONTH = new Intl.DateTimeFormat("mk-MK", { month: "long", year: "numeric", timeZone: "UTC" });
const NUMBER = new Intl.NumberFormat("de-DE"); // 230.000 — the dot grouping used for денари

function monthLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`)).replace(/\s*г\.?$/, "");
}

function money(n: number): string {
  return `${NUMBER.format(Math.round(n))} ден`;
}

/** One series (count per category), so one hue; every bar carries its label
 * and value. Each bar's width is its share of the whole (count / total
 * across every row), not relative to the largest single category — with 2
 * events split 1 confirmed / 1 in preparation, both bars show half-full,
 * not both full just because they're tied for "most." */
function Bars({ rows }: { rows: { label: string; count: number }[] }) {
  const total = Math.max(1, rows.reduce((sum, r) => sum + r.count, 0));
  return (
    <ul className="s3-bars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.count}`}>
          <span className="s3-bar-label">{r.label}</span>
          <span className="s3-bar-track">
            <span className="s3-bar-fill" style={{ width: `${(r.count / total) * 100}%` }} />
          </span>
          <span className="s3-bar-num">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Извештаи (B9): period and hall filter (plain GET form), totals, months, types, statuses, fill per hall. */
export function ReportsClient({
  initialReport,
  rooms,
  filters,
}: {
  /** Already-resolved data for the locked-feature (sample) branch — the page
   * never fetches real data in that case regardless of elevation. */
  initialReport?: ReportData;
  rooms: { id: string; name: string }[];
  filters: ReportFilters;
}) {
  const { token: managerToken } = useManagerElevation();
  const router = useRouter();
  const [report, setReport] = useState<ReportData | null>(initialReport ?? null);
  const [reportError, setReportError] = useState<string | null>(null);
  // A filter change keeps the previous numbers on screen until the new ones
  // arrive — this says they are being replaced, so they aren't misread.
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialReport) return; // sample-report (locked-feature) branch already has its data
    if (!managerToken) {
      setReport(null);
      setReportError(null); // an old failure must not greet the next login
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.roomId) params.set("room", filters.roomId);
    fetch(`/api/venue/reports?${params.toString()}`, { headers: { "x-venue-manager-token": managerToken }, signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) reportElevationRejected();
          const body = await res.json().catch(() => null);
          setReportError(body?.error ?? "Извештајот не можеше да се вчита.");
          return;
        }
        setReport(await res.json());
        setReportError(null);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return; // superseded by a newer filter/token change
        setReportError("Извештајот не можеше да се вчита.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [managerToken, filters.from, filters.to, filters.roomId, initialReport]);

  if (!managerToken && !initialReport) {
    return <p className="muted" style={{ padding: 24 }}>Извештаите се достапни само за менаџери.</p>;
  }
  if (!report) {
    return reportError ? (
      <p role="alert" style={{ padding: 24 }}>{reportError}</p>
    ) : (
      <p className="muted" style={{ padding: 24 }}>Се вчитува...</p>
    );
  }

  const { totals } = report;

  // A plain <form method="get"> submit is a full browser navigation, which
  // remounts PanelShell's ManagerElevationProvider and drops the manager's
  // token (held only in React state, by design — final review finding: the
  // filter form was unusable for an elevated manager, since submitting it
  // always bounced them back to "managers only"). router.push keeps the URL
  // (and so the locked/sample branch's server-side read, and shareable
  // links) working exactly as before, without the hard reload.
  function handleFilterSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["from", "to", "room"]) {
      const value = data.get(key);
      if (typeof value === "string" && value) params.set(key, value);
    }
    router.push(`/venue/reports${params.size > 0 ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="wrap">
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Извештаи</h2>
        </div>
        <form onSubmit={handleFilterSubmit} className="s3-report-filter">
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
          <button type="submit" className="btn btn-gold" disabled={isLoading}>
            {isLoading ? "Се вчитува..." : "Прикажи"}
          </button>
        </form>
        {reportError ? <p role="alert" style={{ margin: "0 20px 16px" }}>{reportError}</p> : null}
      </section>

      <section className="tiles" aria-label="Вкупно" aria-busy={isLoading} style={isLoading ? { opacity: 0.55 } : undefined}>
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
