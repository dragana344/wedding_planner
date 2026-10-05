import { requireAdmin } from "@/lib/admin/guard";
import { Icon } from "@/components/venue/shell/Icon";
import { getOverviewStats, listAudit } from "@/lib/admin/queries";
import { formatMkDate } from "@/lib/date";

export const dynamic = "force-dynamic";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("mk-MK", { timeZone: "Europe/Skopje" });
}

export default async function OverviewPage() {
  await requireAdmin({ page: true });
  const [stats, audit] = await Promise.all([getOverviewStats(), listAudit({ actorType: "admin" })]);
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
          <h2 className="panel-t">Регистрации по недела</h2>
        </div>
        <table className="s1-tbl">
          <thead>
            <tr>
              <th>Недела од</th>
              <th>Нови локали</th>
            </tr>
          </thead>
          <tbody>
            {stats.signupsByWeek.map((w) => (
              <tr key={w.week}>
                <td>{formatMkDate(w.week)}</td>
                <td>{w.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Последни админ акции</h2>
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
