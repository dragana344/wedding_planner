import { headers } from "next/headers";
import { getBudgetSummary } from "@/lib/couple/budget";
import { BudgetClient } from "@/components/couple/BudgetClient";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const summary = await getBudgetSummary(eventId);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <BudgetClient initialSummary={summary} />
    </main>
  );
}
