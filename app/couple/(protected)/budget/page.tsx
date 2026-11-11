import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getBudgetSummary } from "@/lib/couple/budget";
import { BudgetClient } from "@/components/couple/BudgetClient";
import { ChangeNotice } from "@/components/couple/ChangeNotice";
import { coupleNotice } from "@/lib/changes/couple-notice";
import { loadCoupleMarks, NO_MARKS } from "@/lib/couple/change-marks";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [summary, { data: event }, marks] = await Promise.all([
    getBudgetSummary(eventId),
    createServiceRoleClient().from("events").select("couple_names").eq("id", eventId).single(),
    // The box is a hint: the page works without it.
    loadCoupleMarks(eventId).catch((e) => {
      console.error("Could not load the change marks", e);
      return NO_MARKS;
    }),
  ]);
  const notice = coupleNotice("finance", marks.unseen.finance);
  return (
    <main>
      {notice ? <ChangeNotice {...notice} /> : null}
      <BudgetClient coupleNames={event?.couple_names ?? ""} initialSummary={summary} />
    </main>
  );
}
