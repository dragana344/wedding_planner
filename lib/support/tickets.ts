import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// The requester's side of a support ticket (venue staff or a couple): their
// own tickets and each ticket's thread with the admin team (0089, 0150).
// support_tickets has zero RLS policies — every read/write goes through the
// service-role client, scoped by a venue/event id the caller resolved
// server-side from the session (never a client-supplied id). A venue only
// ever sees the tickets it filed itself, never a couple's conversation with
// the team.

export type TicketStatus = "new" | "in_progress" | "done";

export interface SupportTicket {
  id: string;
  venueId: string;
  eventId: string | null;
  submittedBy: "venue" | "couple";
  name: string;
  problem: string;
  description: string;
  status: TicketStatus;
  /** An admin reply the requester hasn't opened yet. */
  requesterUnread: boolean;
  lastMessageAt: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SupportTicketInput {
  name: string;
  problem: string;
  description: string;
}

export interface TicketMessage {
  id: string;
  author: "requester" | "admin";
  body: string;
  createdAt: string;
}

export type RequesterScope = { venueId: string } | { eventId: string };

const COLUMNS =
  "id, venue_id, event_id, submitted_by, name, problem, description, status, requester_unread, last_message_at, resolved_at, created_at";
const MESSAGE_COLUMNS = "id, author, body, created_at";

type SupportTicketDb = {
  id: string;
  venue_id: string;
  event_id: string | null;
  submitted_by: "venue" | "couple";
  name: string;
  problem: string;
  description: string;
  status: TicketStatus;
  requester_unread: boolean;
  last_message_at: string;
  resolved_at: string | null;
  created_at: string;
};
type TicketMessageDb = { id: string; author: "requester" | "admin"; body: string; created_at: string };

const db = () => createServiceRoleClient();

export function toTicket(row: SupportTicketDb): SupportTicket {
  return {
    id: row.id,
    venueId: row.venue_id,
    eventId: row.event_id,
    submittedBy: row.submitted_by,
    name: row.name,
    problem: row.problem,
    description: row.description,
    status: row.status,
    requesterUnread: row.requester_unread,
    lastMessageAt: row.last_message_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export const toTicketMessage = (m: TicketMessageDb): TicketMessage => ({ id: m.id, author: m.author, body: m.body, createdAt: m.created_at });

/** The columns that pin a ticket to this requester (always with submitted_by, so a venue never matches a couple's ticket). */
function scopeMatch(scope: RequesterScope): Record<string, string> {
  return "eventId" in scope ? { event_id: scope.eventId, submitted_by: "couple" } : { venue_id: scope.venueId, submitted_by: "venue" };
}

export async function insertTicket(row: { venue_id: string; event_id?: string; submitted_by: "venue" | "couple" } & SupportTicketInput): Promise<SupportTicket> {
  const { data, error } = await db().from("support_tickets").insert(row).select(COLUMNS).single();
  if (error) throw error;
  return toTicket(data as SupportTicketDb);
}

export async function listRequesterTickets(scope: RequesterScope): Promise<SupportTicket[]> {
  const { data, error } = await db().from("support_tickets").select(COLUMNS).match(scopeMatch(scope)).order("last_message_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as SupportTicketDb[]).map(toTicket);
}

/** The ticket and its replies, or null when it isn't this requester's. Opening it clears the "new reply" marker. */
export async function getRequesterThread(scope: RequesterScope, ticketId: string): Promise<{ ticket: SupportTicket; messages: TicketMessage[] } | null> {
  const { data, error } = await db().from("support_tickets").select(COLUMNS).eq("id", ticketId).match(scopeMatch(scope)).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const ticket = toTicket(data as SupportTicketDb);
  const { data: messages, error: messagesError } = await db()
    .from("support_ticket_messages")
    .select(MESSAGE_COLUMNS)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (messagesError) throw messagesError;
  if (ticket.requesterUnread) {
    const { error: seenError } = await db().from("support_tickets").update({ requester_unread: false }).eq("id", ticketId);
    if (seenError) throw seenError;
    ticket.requesterUnread = false;
  }
  return { ticket, messages: ((messages ?? []) as TicketMessageDb[]).map(toTicketMessage) };
}

/**
 * A requester's reply. It puts the ticket back in the team's queue
 * (awaiting_admin) and reopens a resolved one, so a follow-up on a "done"
 * ticket is never lost. Returns null when the ticket isn't this requester's.
 */
export async function replyAsRequester(scope: RequesterScope, ticketId: string, body: string): Promise<{ message: TicketMessage; ticket: SupportTicket } | null> {
  const { data: current, error } = await db().from("support_tickets").select("id, status").eq("id", ticketId).match(scopeMatch(scope)).maybeSingle();
  if (error) throw error;
  if (!current) return null;
  const { data: message, error: insertError } = await db()
    .from("support_ticket_messages")
    .insert({ ticket_id: ticketId, author: "requester", body })
    .select(MESSAGE_COLUMNS)
    .single();
  if (insertError) throw insertError;
  const reopen = (current as { status: TicketStatus }).status === "done";
  const { data: updated, error: updateError } = await db()
    .from("support_tickets")
    .update({
      awaiting_admin: true,
      last_message_at: (message as TicketMessageDb).created_at,
      ...(reopen ? { status: "in_progress", resolved_at: null } : {}),
    })
    .eq("id", ticketId)
    .select(COLUMNS)
    .single();
  if (updateError) throw updateError;
  return { message: toTicketMessage(message as TicketMessageDb), ticket: toTicket(updated as SupportTicketDb) };
}
