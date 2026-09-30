// lib/couple/dashboard.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listAgendaItems } from "./agenda";
import { listLocations } from "./locations";
import { getGuestStats, type GuestStats } from "./guests";
import { getInvitation } from "./invitations";
import { getBudgetSummary } from "./budget";
import { getChecklistStats, type ChecklistStats } from "./checklist";

export interface CoupleEventSummary {
  id: string;
  couple_names: string;
  event_date: string;
  event_type: string;
  guest_count_estimate: number | null;
  venue_name: string;
  rooms: { id: string; name: string }[];
  seatedCount: number;
  menuStatus: { kind: "template"; name: string } | { kind: "custom"; itemCount: number } | { kind: "none" };
  contact_email: string | null;
  contact_email_2: string | null;
  contact_phone: string | null;
  agendaCount: number;
  locationCount: number;
  guestStats: GuestStats;
  hasInvitation: boolean;
  budgetRemaining: number;
  budgetTotalEstimated: number;
  checklistStats: ChecklistStats;
}

export async function getEventSummary(eventId: string): Promise<CoupleEventSummary> {
  const client = createServiceRoleClient();

  const { data: event, error } = await client
    .from("events")
    .select(
      "id, couple_names, event_date, event_type, guest_count_estimate, venue_id, menu_template_id, contact_email, contact_email_2, contact_phone, event_rooms(rooms(id, name)), event_layout_elements(element_type, table_types(seats))"
    )
    .eq("id", eventId)
    .single();
  if (error) throw error;

  const { data: venue } = await client.from("venues").select("name").eq("id", event.venue_id).single();

  const rooms = ((event.event_rooms ?? []) as { rooms: { id: string; name: string } | { id: string; name: string }[] | null }[])
    .map((r) => (Array.isArray(r.rooms) ? r.rooms[0] : r.rooms))
    .filter((r): r is { id: string; name: string } => Boolean(r));

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

  let menuStatus: CoupleEventSummary["menuStatus"] = { kind: "none" };
  if (event.menu_template_id) {
    const { data: template } = await client.from("menu_templates").select("name").eq("id", event.menu_template_id).single();
    menuStatus = { kind: "template", name: template?.name ?? "Unknown menu" };
  } else {
    const { count } = await client
      .from("event_custom_menu_items")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId);
    if (count && count > 0) menuStatus = { kind: "custom", itemCount: count };
  }

  const [agendaItems, locations, guestStats, invitation, budgetSummary, checklistStats] = await Promise.all([
    listAgendaItems(eventId),
    listLocations(eventId),
    getGuestStats(eventId),
    getInvitation(eventId),
    getBudgetSummary(eventId),
    getChecklistStats(eventId),
  ]);

  return {
    id: event.id,
    couple_names: event.couple_names,
    event_date: event.event_date,
    event_type: event.event_type,
    guest_count_estimate: event.guest_count_estimate,
    venue_name: venue?.name ?? "Unknown venue",
    rooms,
    seatedCount,
    menuStatus,
    contact_email: event.contact_email,
    contact_email_2: event.contact_email_2,
    contact_phone: event.contact_phone,
    agendaCount: agendaItems.length,
    locationCount: locations.length,
    guestStats,
    hasInvitation: invitation !== null,
    budgetRemaining: budgetSummary.remaining,
    budgetTotalEstimated: budgetSummary.totalEstimated,
    checklistStats,
  };
}
