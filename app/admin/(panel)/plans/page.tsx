import { requireAdmin } from "@/lib/admin/guard";
import Link from "next/link";
import { listPlans } from "@/lib/admin/queries";
import { CreatePlanForm } from "@/components/admin/CreatePlanForm";
import { AddPanel } from "@/components/shared/AddPanel";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  await requireAdmin({ page: true });
  const plans = await listPlans();
  return (
    <div className="wrap">
      <AddPanel title="Ново ниво" defaultOpen={plans.length === 0}>
        <CreatePlanForm />
      </AddPanel>

      <section className="panel">
        {plans.length === 0 ? (
          <p className="s1-empty">Нема дефинирани нивоа.</p>
        ) : (
          <table className="s1-tbl s1-cards">
            <thead>
              <tr>
                <th>Ниво</th>
                <th>Стандардно</th>
                <th>Јавно</th>
                <th>Локали</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td data-label="Ниво" className="tc-main">
                    <Link href={`/admin/plans/${p.id}`}>{p.name}</Link>
                  </td>
                  <td data-label="Стандардно">{p.isDefault ? "Да" : "—"}</td>
                  <td data-label="Јавно">{p.isPublic ? "Да" : "—"}</td>
                  <td data-label="Локали">{p.venueCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
