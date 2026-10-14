import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// support_tickets has zero RLS policies (migration 0089) — every read/write
// goes through the service-role client, scoped by a venue_id resolved
// server-side from the signed-in session (never a client-supplied id).

export interface SupportTicket {
  id: string;
  venueId: string;
  eventId: string | null;
  submittedBy: "venue" | "couple";
  name: string;
  problem: string;
  description: string;
  status: "pending" | "done";
  adminComment: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SupportTicketInput {
  name: string;
  problem: string;
  description: string;
}

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

export async function submitVenueSupportTicket(venueId: string, input: SupportTicketInput): Promise<SupportTicket> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("support_tickets")
    .insert({ venue_id: venueId, submitted_by: "venue", ...input })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toTicket(data as SupportTicketDb);
}

export async function listVenueSupportTickets(venueId: string): Promise<SupportTicket[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("support_tickets")
    .select(COLUMNS)
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as SupportTicketDb[]).map(toTicket);
}
