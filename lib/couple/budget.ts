import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { BUDGET_CATEGORIES } from "@/lib/couple/budget-categories";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

export interface BudgetItem {
  id: string;
  event_id: string;
  category: string;
  custom_label: string | null;
  name: string;
  estimated_amount: number | null;
  paid_amount: number;
  created_at: string;
}

export interface BudgetItemInput {
  category: string;
  custom_label: string | null;
  name: string;
  estimated_amount: number | null;
  paid_amount: number;
}

export interface VenueBudgetLine {
  estimated_amount: number | null;
  paid_amount: number | null;
}

export interface BudgetSummary {
  venue: VenueBudgetLine;
  items: BudgetItem[];
  totalEstimated: number;
  totalPaid: number;
  remaining: number;
}

const COLUMNS = "id, event_id, category, custom_label, name, estimated_amount, paid_amount, created_at";

function categoryIndex(categoryId: string): number {
  const idx = BUDGET_CATEGORIES.findIndex((c) => c.id === categoryId);
  return idx === -1 ? BUDGET_CATEGORIES.length : idx;
}

function sortBudgetItems(items: BudgetItem[]): BudgetItem[] {
  return [...items].sort((a, b) => {
    const catDiff = categoryIndex(a.category) - categoryIndex(b.category);
    if (catDiff !== 0) return catDiff;
    return a.created_at.localeCompare(b.created_at);
  });
}

export async function listBudgetItems(eventId: string): Promise<BudgetItem[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_budget_items")
    .select(COLUMNS)
    .eq("event_id", eventId)
    .order("created_at")
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return sortBudgetItems(checkListBound(data, "event_budget_items"));
}

export async function addBudgetItem(eventId: string, input: BudgetItemInput): Promise<BudgetItem> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_budget_items")
    .insert({ event_id: eventId, ...input })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateBudgetItem(eventId: string, itemId: string, input: BudgetItemInput): Promise<BudgetItem> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_budget_items")
    .update(input)
    .eq("id", itemId)
    .eq("event_id", eventId)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBudgetItem(eventId: string, itemId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client
    .from("event_budget_items")
    .delete()
    .eq("id", itemId)
    .eq("event_id", eventId);
  if (error) throw error;
}

export async function getBudgetSummary(eventId: string): Promise<BudgetSummary> {
  const client = createServiceRoleClient();
  const { data: event, error: eventError } = await client
    .from("events")
    .select("total_price, deposit_paid")
    .eq("id", eventId)
    .single();
  if (eventError) throw eventError;

  const items = await listBudgetItems(eventId);

  const venue: VenueBudgetLine = {
    estimated_amount: event.total_price,
    paid_amount: event.deposit_paid,
  };

  const totalEstimated =
    (venue.estimated_amount ?? 0) + items.reduce((sum, i) => sum + (i.estimated_amount ?? 0), 0);
  const totalPaid = (venue.paid_amount ?? 0) + items.reduce((sum, i) => sum + i.paid_amount, 0);

  return { venue, items, totalEstimated, totalPaid, remaining: totalEstimated - totalPaid };
}
