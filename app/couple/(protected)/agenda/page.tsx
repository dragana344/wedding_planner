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
      <AgendaClient
        initialItems={items}
        coupleNames={summary.couple_names}
        eventDate={summary.event_date}
        venue={{
          name: summary.venue_name,
          address: summary.venue_address,
          rooms: summary.rooms.map((r) => r.name),
          roomAddress: summary.rooms.find((r) => r.address?.trim())?.address ?? null,
          roomMapUrl: summary.rooms.find((r) => r.map_url?.trim())?.map_url ?? null,
        }}
      />
    </main>
  );
}
