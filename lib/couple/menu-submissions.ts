import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getGuestStats, type AllergyMenuGroup } from "@/lib/couple/guests";
import { menuNumbersDiffer, toMenuSubmission, type MenuNumbers, type MenuSubmission, type MenuSubmissionRow } from "@/lib/menu-numbers";

export const COUPLE_SENDER = "Младенците";
export const NO_MENU_ERROR = "Салата сè уште нема поставено мени.";
export const ALLERGY_SUMMARY_MAX = 2000;

type NotDone = { id: string; full_name: string }[];

const SUBMISSION_COLUMNS = "id, sent_at, sent_by, counts, menu_titles, total, seen_at, seen_by, source, unanswered, allergy_summary, allergy_notes";

/** The numbers as they stand now (done guests only), the guests still blocking a send, and their allergy notes by menu. */
export async function currentMenuNumbers(eventId: string): Promise<{ numbers: MenuNumbers; notDone: NotDone; allergyNotes: AllergyMenuGroup[] }> {
  const stats = await getGuestStats(eventId);
  return {
    numbers: { menus: stats.menus, total: stats.menus.reduce((sum, m) => sum + m.count, 0) },
    notDone: stats.notDone,
    allergyNotes: stats.allergyNotes,
  };
}

/** The event's sent numbers, newest first. */
export async function listMenuSubmissions(eventId: string, limit = 2): Promise<MenuSubmission[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_menu_submissions")
    .select(SUBMISSION_COLUMNS)
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

/**
 * Saves a snapshot of the numbers for the venue, recomputed here; refuses
 * while any guest is unfinished. Allergy info is strict either/or: a
 * non-blank `allergySummary` is stored as-is and the raw notes are dropped;
 * a blank one falls back to the raw per-guest notes grouped by menu, so the
 * venue is never left with nothing just because the couple skipped it.
 */
export async function sendMenuNumbers(eventId: string, allergySummary?: string | null): Promise<MenuSubmission> {
  const { numbers, notDone, allergyNotes } = await currentMenuNumbers(eventId);
  if (numbers.menus.length === 0) throw new Error(NO_MENU_ERROR);
  if (notDone.length > 0) throw new Error(notDone.length === 1 ? "Уште 1 гостин нема конечен одговор." : `Уште ${notDone.length} гости немаат конечен одговор.`);

  const trimmedSummary = allergySummary?.trim() || null;
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_menu_submissions")
    .insert({
      event_id: eventId,
      sent_by: COUPLE_SENDER,
      counts: Object.fromEntries(numbers.menus.map((m) => [m.id, m.count])),
      menu_titles: Object.fromEntries(numbers.menus.map((m) => [m.id, m.name])),
      total: numbers.total,
      allergy_summary: trimmedSummary,
      allergy_notes: trimmedSummary ? null : allergyNotes.length > 0 ? allergyNotes : null,
    })
    .select(SUBMISSION_COLUMNS)
    .single();
  if (error) throw error;
  return toMenuSubmission(data as unknown as MenuSubmissionRow);
}
