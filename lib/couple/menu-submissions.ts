import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getGuestStats } from "@/lib/couple/guests";
import { menuNumbersDiffer, toMenuSubmission, type MenuNumbers, type MenuSubmission, type MenuSubmissionRow } from "@/lib/menu-numbers";

export const COUPLE_SENDER = "Младенците";
export const NO_MENU_ERROR = "Салата сè уште нема поставено мени.";

type NotDone = { id: string; full_name: string }[];

/** The numbers as they stand now (done guests only) and the guests still blocking a send. */
export async function currentMenuNumbers(eventId: string): Promise<{ numbers: MenuNumbers; notDone: NotDone }> {
  const stats = await getGuestStats(eventId);
  return {
    numbers: { menus: stats.menus, total: stats.menus.reduce((sum, m) => sum + m.count, 0) },
    notDone: stats.notDone,
  };
}

/** The event's sent numbers, newest first. */
export async function listMenuSubmissions(eventId: string, limit = 2): Promise<MenuSubmission[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_menu_submissions")
    .select("id, sent_at, sent_by, counts, menu_titles, total, seen_at, seen_by, source, unanswered")
    .eq("event_id", eventId)
    .order("sent_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as MenuSubmissionRow[]).map(toMenuSubmission);
}

/** Whether the current numbers differ from the latest sent ones (false when nothing was sent). */
export function changedSince(latest: MenuSubmission | null, current: MenuNumbers): boolean {
  return latest ? menuNumbersDiffer(latest.numbers, current) : false;
}

/** Saves a snapshot of the numbers for the venue, recomputed here; refuses while any guest is unfinished. */
export async function sendMenuNumbers(eventId: string): Promise<MenuSubmission> {
  const { numbers, notDone } = await currentMenuNumbers(eventId);
  if (numbers.menus.length === 0) throw new Error(NO_MENU_ERROR);
  if (notDone.length > 0) throw new Error(notDone.length === 1 ? "Уште 1 гостин нема конечен одговор." : `Уште ${notDone.length} гости немаат конечен одговор.`);

  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_menu_submissions")
    .insert({
      event_id: eventId,
      sent_by: COUPLE_SENDER,
      counts: Object.fromEntries(numbers.menus.map((m) => [m.id, m.count])),
      menu_titles: Object.fromEntries(numbers.menus.map((m) => [m.id, m.name])),
      total: numbers.total,
    })
    .select("id, sent_at, sent_by, counts, menu_titles, total, seen_at, seen_by, source, unanswered")
    .single();
  if (error) throw error;
  return toMenuSubmission(data as unknown as MenuSubmissionRow);
}
