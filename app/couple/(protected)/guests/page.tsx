import { headers } from "next/headers";
import { listGuests, getGuestStats } from "@/lib/couple/guests";
import { getEventSummary } from "@/lib/couple/dashboard";
import { GuestsClient } from "@/components/couple/GuestsClient";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [guests, stats, summary] = await Promise.all([
    listGuests(eventId),
    getGuestStats(eventId),
    getEventSummary(eventId),
  ]);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <GuestsClient initialGuests={guests} initialStats={stats} eventType={summary.event_type} />
    </main>
  );
}
