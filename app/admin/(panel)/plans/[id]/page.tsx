import { requireAdmin } from "@/lib/admin/guard";
import { notFound } from "next/navigation";
import { listPlans } from "@/lib/admin/queries";
import { PlanAdminPanels } from "@/components/admin/PlanAdminPanels";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ page: true });
  const { id } = await params;
  // The plan catalogue is small (a handful of rows), unlike venues/events —
  // no dedicated getPlanDetail query exists, so this reuses listPlans() the
  // same way the list page does and looks the one plan up by id.
  const plans = await listPlans();
  const plan = plans.find((p) => p.id === id);
  if (!plan) notFound();
  return (
    <div className="wrap">
      <PlanAdminPanels plan={plan} />
    </div>
  );
}
