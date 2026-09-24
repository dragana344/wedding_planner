import { headers } from "next/headers";
import { listAgendaItems } from "@/lib/couple/agenda";
import { AgendaClient } from "@/components/couple/AgendaClient";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const items = await listAgendaItems(eventId);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <AgendaClient initialItems={items} />
    </main>
  );
}
