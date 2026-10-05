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
  const existing = await listAgendaItems(eventId);
  // A timed item goes in front of the first item that starts later, so the
  // programme guests see reads in order without the couple re-sorting it.
  // Items without a time, and anything the couple moved by hand, stay put.
  const later = input.time ? existing.find((item) => item.time !== null && item.time.slice(0, 5) > input.time!.slice(0, 5)) : undefined;
  const last = existing[existing.length - 1];
  const sortOrder = later ? later.sort_order : last ? last.sort_order + 1 : 0;
  if (later) {
    // Make room from the end backwards, one row at a time.
    for (const item of existing.filter((i) => i.sort_order >= later.sort_order).reverse()) {
      const { error: shiftError } = await client
        .from("event_agenda_items")
        .update({ sort_order: item.sort_order + 1 })
        .eq("id", item.id)
        .eq("event_id", eventId);
      if (shiftError) throw shiftError;
    }
  }
  const { data, error } = await client
    .from("event_agenda_items")
    .insert({ event_id: eventId, ...input, sort_order: sortOrder })
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
