import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

export interface AgendaItem {
  id: string;
  event_id: string;
  time: string | null;
  title: string;
  notes: string | null;
  sort_order: number;
}

export interface AgendaItemInput {
  time: string | null;
  title: string;
  notes: string | null;
}

const COLUMNS = "id, event_id, time, title, notes, sort_order";

export async function listAgendaItems(eventId: string): Promise<AgendaItem[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_agenda_items")
    .select(COLUMNS)
    .eq("event_id", eventId)
    .order("sort_order")
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return checkListBound(data, "event_agenda_items");
}

export async function addAgendaItem(eventId: string, input: AgendaItemInput): Promise<AgendaItem> {
  const client = createServiceRoleClient();
  const { data: last } = await client
    .from("event_agenda_items")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = last && last.length > 0 ? last[0].sort_order + 1 : 0;
  const { data, error } = await client
    .from("event_agenda_items")
    .insert({ event_id: eventId, ...input, sort_order: nextSortOrder })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateAgendaItem(
  eventId: string,
  itemId: string,
  input: AgendaItemInput
): Promise<AgendaItem> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_agenda_items")
    .update(input)
    .eq("id", itemId)
    .eq("event_id", eventId)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAgendaItem(eventId: string, itemId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client
    .from("event_agenda_items")
    .delete()
    .eq("id", itemId)
    .eq("event_id", eventId);
  if (error) throw error;
}

export async function moveAgendaItem(
  eventId: string,
  itemId: string,
  direction: "up" | "down"
): Promise<AgendaItem[]> {
  const client = createServiceRoleClient();
  const items = await listAgendaItems(eventId);
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx === -1) throw new Error("Agenda item not found.");
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return items;

  const a = items[idx];
  const b = items[swapIdx];
  // REL-005: both updates in one statement (migration 0041).
  const { error } = await client.rpc("swap_agenda_items", { p_event_id: eventId, p_item_a: a.id, p_item_b: b.id });
  if (error) throw error;

  return listAgendaItems(eventId);
}
