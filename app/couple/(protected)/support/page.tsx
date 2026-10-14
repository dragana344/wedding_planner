import { headers } from "next/headers";
import { listCoupleSupportTickets } from "@/lib/couple/support";
import { SupportTicketPanel } from "@/components/support/SupportTicketPanel";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const tickets = await listCoupleSupportTickets(eventId);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <SupportTicketPanel endpoint="/api/couple/support" initialTickets={tickets} />
    </main>
  );
}
