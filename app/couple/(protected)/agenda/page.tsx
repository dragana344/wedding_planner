import { headers } from "next/headers";
import { listAgendaItems } from "@/lib/couple/agenda";
import { getEventSummary } from "@/lib/couple/dashboard";
import { AgendaClient } from "@/components/couple/AgendaClient";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [items, summary] = await Promise.all([listAgendaItems(eventId), getEventSummary(eventId)]);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <AgendaClient initialItems={items} coupleNames={summary.couple_names} eventDate={summary.event_date} />
    </main>
  );
}
