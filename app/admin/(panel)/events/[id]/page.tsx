import { requireAdmin } from "@/lib/admin/guard";
import { notFound } from "next/navigation";
import { getEventDetail, getEventOverrides } from "@/lib/admin/queries";
import { getEventFeatures } from "@/lib/entitlements/server";
import { EventAdminPanels } from "@/components/admin/EventAdminPanels";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ page: true });
  const { id } = await params;
  const event = await getEventDetail(id);
  if (!event) notFound();
  const [overrides, features] = await Promise.all([getEventOverrides(id), getEventFeatures(id)]);
  return (
    <div className="wrap">
      <EventAdminPanels event={event} overrides={overrides} features={features} />
    </div>
  );
}
