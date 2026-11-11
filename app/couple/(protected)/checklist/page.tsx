import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listChecklistItems, computeChecklistStats } from "@/lib/couple/checklist";
import { ChecklistClient } from "@/components/couple/ChecklistClient";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [items, { data: event }] = await Promise.all([
    listChecklistItems(eventId),
    createServiceRoleClient().from("events").select("couple_names").eq("id", eventId).single(),
  ]);
  const stats = computeChecklistStats(items);
  return (
    <main>
      <ChecklistClient coupleNames={event?.couple_names ?? ""} initialItems={items} initialStats={stats} />
    </main>
  );
}
