import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SupportTicket, SupportTicketInput } from "@/lib/venue/support";

// support_tickets has zero RLS policies (migration 0089) — every read/write
// goes through the service-role client, scoped by an event_id resolved
// server-side from the couple's session (never a client-supplied id). The
// ticket's venue_id is resolved here too, from the event, so admin can
// still see which venue it belongs to.

const COLUMNS = "id, venue_id, event_id, submitted_by, name, problem, description, status, admin_comment, resolved_at, created_at";

type SupportTicketDb = {
  id: string;
  venue_id: string;
  event_id: string | null;
  submitted_by: "venue" | "couple";
  name: string;
  problem: string;
  description: string;
  status: "pending" | "done";
  admin_comment: string | null;
  resolved_at: string | null;
  created_at: string;
};

function toTicket(row: SupportTicketDb): SupportTicket {
  return {
    id: row.id,
    venueId: row.venue_id,
    eventId: row.event_id,
    submittedBy: row.submitted_by,
    name: row.name,
    problem: row.problem,
    description: row.description,
    status: row.status,
    adminComment: row.admin_comment,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export async function submitCoupleSupportTicket(eventId: string, input: SupportTicketInput): Promise<SupportTicket> {
  const client = createServiceRoleClient();
  const { data: event, error: eventError } = await client.from("events").select("venue_id").eq("id", eventId).single();
  if (eventError) throw eventError;
  const { data, error } = await client
    .from("support_tickets")
    .insert({ venue_id: event.venue_id, event_id: eventId, submitted_by: "couple", ...input })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toTicket(data as SupportTicketDb);
}

export async function listCoupleSupportTickets(eventId: string): Promise<SupportTicket[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("support_tickets")
    .select(COLUMNS)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as SupportTicketDb[]).map(toTicket);
}
