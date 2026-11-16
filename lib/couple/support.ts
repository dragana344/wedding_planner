import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { insertTicket, listRequesterTickets, type SupportTicket, type SupportTicketInput } from "@/lib/support/tickets";

// The couple dashboard's support tickets. eventId always comes from the
// couple's session, never from the client. The ticket's venue_id is resolved
// here from the event, so admin can still see which venue it belongs to; the
// shared requester logic (threads, replies) lives in lib/support/tickets.ts.

export async function submitCoupleSupportTicket(eventId: string, input: SupportTicketInput): Promise<SupportTicket> {
  const { data: event, error } = await createServiceRoleClient().from("events").select("venue_id").eq("id", eventId).single();
  if (error) throw error;
  return insertTicket({ venue_id: event.venue_id, event_id: eventId, submitted_by: "couple", ...input });
}

export function listCoupleSupportTickets(eventId: string): Promise<SupportTicket[]> {
  return listRequesterTickets({ eventId });
}
