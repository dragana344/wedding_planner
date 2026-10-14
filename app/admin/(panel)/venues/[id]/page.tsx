import { requireAdmin } from "@/lib/admin/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVenueDetail, getVenueOverrides, listPlans } from "@/lib/admin/queries";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { VenueAdminPanels } from "@/components/admin/VenueAdminPanels";
import { BackButton } from "@/components/admin/BackButton";
import { todayIn } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function VenueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ page: true });
  const { id } = await params;
  const venue = await getVenueDetail(id);
  if (!venue) notFound();
  const [plans, overrides, features] = await Promise.all([listPlans(), getVenueOverrides(id), getVenueFeatures(id)]);
  const today = todayIn();
  return (
    <div className="wrap">
      <BackButton label="Назад кон локали" />

      <VenueAdminPanels venue={venue} plans={plans.map((p) => ({ id: p.id, name: p.name }))} overrides={overrides} features={features} />

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Настани</h2>
        </div>
        {venue.events.length === 0 ? (
          <p className="s1-empty">Нема настани за овој локал.</p>
        ) : (
          <table className="s1-tbl">
            <thead>
              <tr>
                <th>Датум</th>
                <th>Пар</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {venue.events.map((e) => (
                <tr key={e.id} className={e.date < today ? "row-past" : undefined}>
                  <td>{e.date}</td>
                  <td>
                    <Link href={`/admin/events/${e.id}`}>{e.coupleNames}</Link>
                  </td>
                  <td>{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Простории</h2>
        </div>
        {venue.rooms.length === 0 ? (
          <p className="s1-empty">Нема дефинирани простории.</p>
        ) : (
          <ul style={{ padding: "12px 20px" }}>
            {venue.rooms.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
