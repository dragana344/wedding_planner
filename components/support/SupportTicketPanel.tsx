"use client";

import { useState } from "react";
import type { SupportTicket } from "@/lib/venue/support";
import { SupportTicketForm } from "./SupportTicketForm";
import { SupportTicketList } from "./SupportTicketList";

/** Form + this caller's own ticket history, for one of /api/venue/support or
 * /api/couple/support. Owns the list locally so a new ticket appears
 * immediately without a round trip back to the server. */
export function SupportTicketPanel({ endpoint, initialTickets }: { endpoint: string; initialTickets: SupportTicket[] }) {
  const [tickets, setTickets] = useState(initialTickets);

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Пријавете проблем</h2>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <SupportTicketForm endpoint={endpoint} onSubmitted={(ticket) => setTickets((t) => [ticket, ...t])} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Ваши барања</h2>
        </div>
        <SupportTicketList tickets={tickets} />
      </section>
    </>
  );
}
