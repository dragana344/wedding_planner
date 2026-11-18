import { requireAdmin } from "@/lib/admin/guard";
import Link from "next/link";
import { Icon } from "@/components/venue/shell/Icon";
import { listPlans, listVenues } from "@/lib/admin/queries";
import { formatMkDate } from "@/lib/date";
import { AddPanel } from "@/components/shared/AddPanel";
import { CreateVenueForm } from "@/components/admin/CreateVenueForm";

export const dynamic = "force-dynamic";

export default async function VenuesPage({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string }> }) {
  await requireAdmin({ page: true });
  const { q, plan } = await searchParams;
  const [venues, plans] = await Promise.all([listVenues({ q, planId: plan }), listPlans()]);
  return (
    <div className="wrap">
      <AddPanel title="Нов локал">
        <CreateVenueForm plans={plans.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault }))} />
      </AddPanel>

      <form className="bar" aria-label="Филтер на локали">
        <div className="search">
          <Icon name="search" size="sm" />
          <input type="search" name="q" defaultValue={q} placeholder="Пребарај локал" aria-label="Пребарај локал" />
        </div>
        <select className="fld" name="plan" defaultValue={plan ?? ""} aria-label="Ниво">
          <option value="">Сите нивоа</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn btn-gold" type="submit">
          Филтрирај
        </button>
      </form>

      <section className="panel">
        {venues.length === 0 ? (
          <p className="s1-empty">Нема локали што одговараат на филтерот.</p>
        ) : (
          <table className="s1-tbl s1-cards">
            <thead>
              <tr>
                <th>Локал</th>
                <th>Ниво</th>
                <th>Регистриран</th>
                <th>Вработени</th>
                <th>Настани</th>
                <th>Последна најава</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {venues.map((v) => (
                <tr key={v.id}>
                  <td data-label="Локал" className="tc-main">
                    <Link href={`/admin/venues/${v.id}`}>{v.name}</Link>
                  </td>
                  <td data-label="Ниво">{v.planName}</td>
                  <td data-label="Регистриран">{formatMkDate(v.createdAt)}</td>
                  <td data-label="Вработени">{v.staffCount}</td>
                  <td data-label="Настани">{v.eventCount}</td>
                  <td data-label="Последна најава">{v.lastSignInAt ? formatMkDate(v.lastSignInAt) : "—"}</td>
                  <td data-label="Статус">{v.blockedAt ? "Блокиран" : "Активен"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
