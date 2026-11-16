import "server-only";
import { insertTicket, listRequesterTickets, type SupportTicket, type SupportTicketInput } from "@/lib/support/tickets";

// The venue dashboard's support tickets. venueId always comes from the
// signed-in session (getCurrentVenueId), never from the client; the shared
// requester logic (threads, replies) lives in lib/support/tickets.ts.

export type { SupportTicket, SupportTicketInput, TicketMessage, TicketStatus } from "@/lib/support/tickets";

export function submitVenueSupportTicket(venueId: string, input: SupportTicketInput): Promise<SupportTicket> {
  return insertTicket({ venue_id: venueId, submitted_by: "venue", ...input });
}

export function listVenueSupportTickets(venueId: string): Promise<SupportTicket[]> {
  return listRequesterTickets({ venueId });
}
