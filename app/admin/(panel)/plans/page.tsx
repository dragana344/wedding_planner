import { requireAdmin } from "@/lib/admin/guard";
import Link from "next/link";
import { listPlans } from "@/lib/admin/queries";
import { CreatePlanForm } from "@/components/admin/CreatePlanForm";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  await requireAdmin({ page: true });
  const plans = await listPlans();
  return (
    <div className="wrap">
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Ново ниво</h2>
        </div>
        <div style={{ padding: "0 20px 16px" }}>
          <CreatePlanForm />
        </div>
      </section>

      <section className="panel">
        {plans.length === 0 ? (
          <p className="s1-empty">Нема дефинирани нивоа.</p>
        ) : (
          <table className="s1-tbl">
            <thead>
              <tr>
                <th>Ниво</th>
                <th>Стандардно</th>
                <th>Јавно</th>
                <th>Сали</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/plans/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.isDefault ? "Да" : "—"}</td>
                  <td>{p.isPublic ? "Да" : "—"}</td>
                  <td>{p.venueCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
