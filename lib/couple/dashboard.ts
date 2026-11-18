// lib/couple/dashboard.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listAgendaItems } from "./agenda";
import { getGuestStats, type GuestStats } from "./guests";
import { getInvitation } from "./invitations";
import { getBudgetSummary } from "./budget";
import { getEventMenus } from "./menu";
import { getChecklistStats, type ChecklistStats } from "./checklist";
import { coupleAccessEnd, coupleAccessUntil } from "./access";

export interface CoupleEventSummary {
  id: string;
  couple_names: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  event_type: string;
  guest_count_estimate: number | null;
  venue_name: string;
  /** The venue's street address (0156: pre-fills an agenda item held at the restaurant). */
  venue_address: string | null;
  /** Project B §1: 'mini' never gets a seating editor — see lib/couple/mini-event.ts. */
  seating_mode: "full" | "mini";
  rooms: { id: string; name: string; address?: string | null; map_url?: string | null }[];
  seatedCount: number;
  /** Titles of the menus set for the event, in the order of getEventMenus. */
  menus: string[];
  contact_email: string | null;
  contact_email_2: string | null;
  contact_phone: string | null;
  agendaCount: number;
  guestStats: GuestStats;
  hasInvitation: boolean;
  budgetRemaining: number;
  budgetTotalEstimated: number;
  checklistStats: ChecklistStats;
  /** events.status, e.g. "cancelled". */
  status: string;
  /** Last day ("YYYY-MM-DD") the couple can open the event (lib/couple/access.ts). */
  access_end: string;
}

export async function getEventSummary(eventId: string): Promise<CoupleEventSummary> {
  const client = createServiceRoleClient();

  const { data: event, error } = await client
    .from("events")
    .select(
      "id, couple_names, event_date, start_time, end_time, event_type, guest_count_estimate, venue_id, contact_email, contact_email_2, contact_phone, seating_mode, status, couple_access_until, couple_access_extended_until, event_rooms(rooms(id, name, address, map_url)), event_layout_elements(element_type, table_types(seats))"
    )
    .eq("id", eventId)
    .single();
  if (error) throw error;

  const { data: venue } = await client.from("venues").select("name, address").eq("id", event.venue_id).single();

  type SummaryRoom = { id: string; name: string; address: string | null; map_url: string | null };
  const rooms = ((event.event_rooms ?? []) as { rooms: SummaryRoom | SummaryRoom[] | null }[])
    .map((r) => (Array.isArray(r.rooms) ? r.rooms[0] : r.rooms))
    .filter((r): r is SummaryRoom => Boolean(r));

  const layoutElements = (event.event_layout_elements ?? []) as unknown as {
    element_type: string;
    table_types: { seats: number } | { seats: number }[] | null;
  }[];
  const seatedCount = layoutElements
    .filter((el) => el.element_type === "table")
    .reduce((sum, el) => {
      const tableType = Array.isArray(el.table_types) ? el.table_types[0] : el.table_types;
      return sum + (tableType?.seats ?? 0);
    }, 0);

  const [agendaItems, guestStats, invitation, budgetSummary, checklistStats, eventMenus] = await Promise.all([
    listAgendaItems(eventId),
    getGuestStats(eventId),
    getInvitation(eventId),
    getBudgetSummary(eventId),
    getChecklistStats(eventId),
    getEventMenus(eventId),
  ]);

  return {
    id: event.id,
    couple_names: event.couple_names,
    event_date: event.event_date,
    start_time: event.start_time,
    end_time: event.end_time,
    event_type: event.event_type,
    guest_count_estimate: event.guest_count_estimate,
    venue_name: venue?.name ?? "Непознат локал",
    venue_address: venue?.address ?? null,
    seating_mode: event.seating_mode as "full" | "mini",
    rooms,
    seatedCount,
    menus: eventMenus.map((m) => m.name),
    contact_email: event.contact_email,
    contact_email_2: event.contact_email_2,
    contact_phone: event.contact_phone,
    agendaCount: agendaItems.length,
    guestStats,
    hasInvitation: invitation !== null,
    budgetRemaining: budgetSummary.remaining,
    budgetTotalEstimated: budgetSummary.totalEstimated,
    checklistStats,
    status: event.status,
    access_end: coupleAccessEnd(event.event_date, coupleAccessUntil(event)),
  };
}
