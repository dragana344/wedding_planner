import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { Icon } from "@/components/venue/shell/Icon";
import { getOverviewStats, getSignupsByWeek, listAudit } from "@/lib/admin/queries";
import { formatMkDate } from "@/lib/date";
import { startOfDaySkopjeIso, endOfDaySkopjeIso } from "@/lib/admin/audit-filters";
import { parseOverviewFilters, type OverviewSearchParams } from "@/lib/admin/overview-filters";
import { RangePanel } from "@/components/shared/RangePanel";

export const dynamic = "force-dynamic";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("mk-MK", { timeZone: "Europe/Skopje" });
}

function WeeksTable({ weeks }: { weeks: { week: string; count: number }[] }) {
  return (
    <table className="s1-tbl">
      <thead>
        <tr>
          <th>Недела од</th>
          <th>Нови локали</th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((w) => (
          <tr key={w.week}>
            <td>{formatMkDate(w.week)}</td>
            <td>{w.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActionsTable({ rows }: { rows: { id: number; occurredAt: string; action: string }[] }) {
  if (rows.length === 0) return <p className="s1-empty">Нема акции во избраниот период.</p>;
  return (
    <table className="s1-tbl">
      <thead>
        <tr>
          <th>Кога</th>
          <th>Акција</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{formatDateTime(r.occurredAt)}</td>
            <td>{r.action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<OverviewSearchParams> }) {
  await requireAdmin({ page: true });
  const filters = parseOverviewFilters(await searchParams);

  const [stats, audit, rangedWeeks, rangedActions] = await Promise.all([
    getOverviewStats(),
    listAudit({ actorType: "admin" }),
    filters.signups ? getSignupsByWeek(filters.signups) : Promise.resolve(null),
    filters.actions
      ? listAudit({ actorType: "admin", from: startOfDaySkopjeIso(filters.actions.from), to: endOfDaySkopjeIso(filters.actions.to) })
      : Promise.resolve(null),
  ]);

  // Each popup's "reset" link must drop only its own two query params,
  // keeping the other popup's range intact — a bare "/admin" link would
  // silently clear both at once if an admin had them open together.
  const signupsResetHref = (() => {
    if (!filters.actions) return "/admin";
    const p = new URLSearchParams({ actionsFrom: filters.actions.from, actionsTo: filters.actions.to });
    return `/admin?${p}`;
  })();
  const actionsResetHref = (() => {
    if (!filters.signups) return "/admin";
    const p = new URLSearchParams({ signupsFrom: filters.signups.from, signupsTo: filters.signups.to });
    return `/admin?${p}`;
  })();

  const tiles = [
    { icon: "tables", label: "Локали", value: stats.venues },
    { icon: "check", label: "Активни (30 дена)", value: stats.activeVenues },
    { icon: "ban", label: "Блокирани", value: stats.blockedVenues },
    { icon: "cal-dot", label: "Настани (30 дена)", value: stats.upcomingEvents },
    { icon: "msg", label: "Нови пораки", value: stats.newMessages },
  ];

  return (
    <div className="wrap">
      <section className="tiles" aria-label="Преглед">
        {tiles.map((t) => (
          <div key={t.label} className="tile">
            <span className="badge">
              <Icon name={t.icon} size="lg" />
            </span>
            <div>
              <div className="num">{t.value}</div>
              <div className="lab">{t.label}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-h">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h2 className="panel-t">Регистрации по недела (последни 4)</h2>
            <RangePanel
              title="Регистрации по период"
              fromName="signupsFrom"
              toName="signupsTo"
              defaultFrom={filters.signups?.from}
              defaultTo={filters.signups?.to}
              isOpen={Boolean(filters.signups)}
              resetHref={signupsResetHref}
              resetLabel="Избери друг период"
            >
              {rangedWeeks ? <WeeksTable weeks={rangedWeeks} /> : <p className="muted">Изберете период и притиснете „Прикажи“.</p>}
            </RangePanel>
          </div>
        </div>
        <WeeksTable weeks={stats.signupsByWeek} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h2 className="panel-t">Последни админ акции</h2>
            <RangePanel
              title="Админ акции по период"
              fromName="actionsFrom"
              toName="actionsTo"
              defaultFrom={filters.actions?.from}
              defaultTo={filters.actions?.to}
              isOpen={Boolean(filters.actions)}
              resetHref={actionsResetHref}
              resetLabel="Избери друг период"
            >
              {rangedActions ? (
                <>
                  <ActionsTable rows={rangedActions.rows} />
                  {rangedActions.hasMore ? (
                    <p className="muted" style={{ marginTop: 8 }}>
                      Прикажани се првите {rangedActions.rows.length}. <Link href="/admin/audit">Целосен дневник →</Link>
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="muted">Изберете период и притиснете „Прикажи“.</p>
              )}
            </RangePanel>
          </div>
        </div>
        {audit.rows.length === 0 ? (
          <p className="s1-empty">Нема забележани акции.</p>
        ) : (
          <table className="s1-tbl">
            <thead>
              <tr>
                <th>Кога</th>
                <th>Акција</th>
              </tr>
            </thead>
            <tbody>
              {audit.rows.slice(0, 20).map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.occurredAt)}</td>
                  <td>{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
