import { headers } from "next/headers";
import { listChecklistItems, computeChecklistStats } from "@/lib/couple/checklist";
import { ChecklistClient } from "@/components/couple/ChecklistClient";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const items = await listChecklistItems(eventId);
  const stats = computeChecklistStats(items);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <ChecklistClient initialItems={items} initialStats={stats} />
    </main>
  );
}
