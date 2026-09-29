// lib/couple/checklist.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { STARTER_CHECKLIST_TITLES } from "@/lib/couple/checklist-templates";
import { todayIn } from "@/lib/date";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

export interface ChecklistSubtask {
  id: string;
  checklist_item_id: string;
  title: string;
  is_done: boolean;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  event_id: string;
  title: string;
  due_date: string | null;
  is_done: boolean;
  created_at: string;
  subtasks: ChecklistSubtask[];
}

export interface ChecklistItemInput {
  title: string;
  due_date: string | null;
}

export interface ChecklistStats {
  total: number;
  open: number;
  done: number;
  overdue: number;
}

const COLUMNS = "id, event_id, title, due_date, is_done, created_at";
const SUBTASK_COLUMNS = "id, checklist_item_id, title, is_done, created_at";
const COLUMNS_WITH_SUBTASKS = `${COLUMNS}, event_checklist_subtasks(${SUBTASK_COLUMNS})`;

function mapItem(raw: Omit<ChecklistItem, "subtasks"> & { event_checklist_subtasks: ChecklistSubtask[] | null }): ChecklistItem {
  return {
    id: raw.id,
    event_id: raw.event_id,
    title: raw.title,
    due_date: raw.due_date,
    is_done: raw.is_done,
    created_at: raw.created_at,
    // Kept in the order they were jotted down (not reshuffled by done
    // state) — they're a fixed set of options being weighed, not a queue.
    subtasks: (raw.event_checklist_subtasks ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

export async function listChecklistItems(eventId: string): Promise<ChecklistItem[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_checklist_items")
    .select(COLUMNS_WITH_SUBTASKS)
    .eq("event_id", eventId)
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  const items = checkListBound(data, "event_checklist_items").map(mapItem);

  if (items.length === 0) {
    const { data: claimed, error: claimError } = await client
      .from("events")
      .update({ checklist_seeded_at: new Date().toISOString() })
      .eq("id", eventId)
      .is("checklist_seeded_at", null)
      .select("id");
    if (claimError) throw claimError;

    if (claimed && claimed.length > 0) {
      // We won the atomic claim — this is genuinely the first time this
      // event's checklist has ever been loaded. Seed it.
      const { error: seedError } = await client
        .from("event_checklist_items")
        .insert(STARTER_CHECKLIST_TITLES.map((title) => ({ event_id: eventId, title, due_date: null })));
      if (seedError) throw seedError;
      const { data: seeded, error: reselectError } = await client
        .from("event_checklist_items")
        .select(COLUMNS_WITH_SUBTASKS)
        .eq("event_id", eventId)
        .order("created_at")
        .limit(MAX_LIST_ROWS);
      if (reselectError) throw reselectError;
      return sortChecklistItems((seeded ?? []).map(mapItem));
    }
    // Either another concurrent request already won the claim and is
    // seeding right now, or this event was already seeded in the past and
    // the couple has since deleted every task — in both cases, do NOT seed
    // again. Return the (possibly still empty) current data as-is.
    return sortChecklistItems(items);
  }

  return sortChecklistItems(items);
}

function sortChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  const open = items
    .filter((i) => !i.is_done)
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
  const done = items.filter((i) => i.is_done).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return [...open, ...done];
}

export async function addChecklistItem(eventId: string, input: ChecklistItemInput): Promise<Omit<ChecklistItem, "subtasks">> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_checklist_items")
    .insert({ event_id: eventId, ...input })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateChecklistItem(
  eventId: string,
  itemId: string,
  input: ChecklistItemInput
): Promise<Omit<ChecklistItem, "subtasks">> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_checklist_items")
    .update(input)
    .eq("id", itemId)
    .eq("event_id", eventId)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function toggleChecklistItem(eventId: string, itemId: string, isDone: boolean): Promise<Omit<ChecklistItem, "subtasks">> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_checklist_items")
    .update({ is_done: isDone })
    .eq("id", itemId)
    .eq("event_id", eventId)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChecklistItem(eventId: string, itemId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client
    .from("event_checklist_items")
    .delete()
    .eq("id", itemId)
    .eq("event_id", eventId);
  if (error) throw error;
}

async function assertItemBelongsToEvent(
  client: ReturnType<typeof createServiceRoleClient>,
  eventId: string,
  itemId: string
): Promise<void> {
  const { data, error } = await client
    .from("event_checklist_items")
    .select("id")
    .eq("id", itemId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Checklist item not found.");
}

export async function addSubtask(eventId: string, itemId: string, title: string): Promise<ChecklistSubtask> {
  const client = createServiceRoleClient();
  await assertItemBelongsToEvent(client, eventId, itemId);
  const { data, error } = await client
    .from("event_checklist_subtasks")
    .insert({ checklist_item_id: itemId, title })
    .select(SUBTASK_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function toggleSubtask(
  eventId: string,
  itemId: string,
  subtaskId: string,
  isDone: boolean
): Promise<ChecklistSubtask> {
  const client = createServiceRoleClient();
  await assertItemBelongsToEvent(client, eventId, itemId);
  const { data, error } = await client
    .from("event_checklist_subtasks")
    .update({ is_done: isDone })
    .eq("id", subtaskId)
    .eq("checklist_item_id", itemId)
    .select(SUBTASK_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSubtask(eventId: string, itemId: string, subtaskId: string): Promise<void> {
  const client = createServiceRoleClient();
  await assertItemBelongsToEvent(client, eventId, itemId);
  const { error } = await client
    .from("event_checklist_subtasks")
    .delete()
    .eq("id", subtaskId)
    .eq("checklist_item_id", itemId);
  if (error) throw error;
}

export function computeChecklistStats(items: ChecklistItem[]): ChecklistStats {
  const today = todayIn();
  return {
    total: items.length,
    open: items.filter((i) => !i.is_done).length,
    done: items.filter((i) => i.is_done).length,
    overdue: items.filter((i) => !i.is_done && i.due_date !== null && i.due_date < today).length,
  };
}

export async function getChecklistStats(eventId: string): Promise<ChecklistStats> {
  return computeChecklistStats(await listChecklistItems(eventId));
}
