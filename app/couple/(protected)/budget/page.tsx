import { headers } from "next/headers";
import { getBudgetSummary } from "@/lib/couple/budget";
import { BudgetClient } from "@/components/couple/BudgetClient";
import { ChangeNotice } from "@/components/couple/ChangeNotice";
import { coupleNotice } from "@/lib/changes/couple-notice";
import { loadCoupleMarks, NO_MARKS } from "@/lib/couple/change-marks";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [summary, marks] = await Promise.all([
    getBudgetSummary(eventId),
    // The box is a hint: the page works without it.
    loadCoupleMarks(eventId).catch((e) => {
      console.error("Could not load the change marks", e);
      return NO_MARKS;
    }),
  ]);
  const notice = coupleNotice("finance", marks.unseen.finance);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      {notice ? <ChangeNotice {...notice} /> : null}
      <BudgetClient initialSummary={summary} />
    </main>
  );
}
