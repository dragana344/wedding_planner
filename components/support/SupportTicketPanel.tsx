"use client";

import { useState } from "react";
import type { SupportTicket } from "@/lib/venue/support";
import { SupportTicketForm } from "./SupportTicketForm";
import { SupportTicketList } from "./SupportTicketList";
import { AddPanel } from "@/components/shared/AddPanel";

/** Form + this caller's own tickets and their conversations, for one of
 * /api/venue/support or /api/couple/support. Owns the list locally so a new
 * ticket or reply shows immediately without a round trip back to the server. */
export function SupportTicketPanel({ endpoint, initialTickets }: { endpoint: string; initialTickets: SupportTicket[] }) {
  const [tickets, setTickets] = useState(initialTickets);

  return (
    <>
      <AddPanel title="Пријавете проблем" defaultOpen={initialTickets.length === 0}>
        <SupportTicketForm endpoint={endpoint} onSubmitted={(ticket) => setTickets((t) => [ticket, ...t])} />
      </AddPanel>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Ваши барања</h2>
        </div>
        <SupportTicketList
          endpoint={endpoint}
          tickets={tickets}
          onTicketChange={(ticket) => setTickets((list) => list.map((t) => (t.id === ticket.id ? ticket : t)))}
        />
      </section>
    </>
  );
}
