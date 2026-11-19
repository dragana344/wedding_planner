import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { pseudonymize } from "@/lib/security/pseudonym";
import { getGuestStats, type AllergyMenuGroup } from "@/lib/couple/guests";
import {
  diffMenuNumbers,
  menuNumbersDiffer,
  prefillEstimate,
  sentNumbers,
  toMenuSubmission,
  withRemainingEstimate,
  type MenuNumbers,
  type MenuSubmission,
  type MenuSubmissionRow,
} from "@/lib/menu-numbers";

export const COUPLE_SENDER = "Младенците";
export const NO_MENU_ERROR = "Салата сè уште нема поставено мени.";
export const ALLERGY_SUMMARY_MAX = 2000;
export const ESTIMATE_REQUIRED_ERROR = "Внесете проценка за гостите без одговор.";
export const ESTIMATE_MENU_ERROR = "Проценката е за мени што го нема на настанот.";

type NotDone = { id: string; full_name: string; people?: number }[];

/** "Одговориле: X гости (Y лица) · Без одговор: Z гости" — what the send screen counts. */
export type AnswerSummary = { answeredGuests: number; answeredPeople: number; unansweredGuests: number; unansweredPeople: number };

const SUBMISSION_COLUMNS =
  "id, sent_at, sent_by, counts, menu_titles, total, seen_at, seen_by, source, unanswered, allergy_summary, allergy_notes, no_meal_count, estimated_counts, estimated_total, estimated_people";

/**
 * A keyed fingerprint of the allergy notes (0182): equal notes give an equal
 * key, and the key never reveals the text. Lets a later allergy change be
 * flagged to the venue even when the couple sent a summary instead.
 */
export function allergyKey(eventId: string, notes: AllergyMenuGroup[]): string {
  const lines = notes
    .flatMap((g) => g.notes.map((n) => `${g.menuId}|${n.guestId}|${n.text}`))
    .sort()
    .join("\n");
  return pseudonymize(`allergy-key:${eventId}`, lines);
}

/**
 * The numbers as they stand now (done guests only), the guests still
 * blocking an exact send, their allergy notes by menu, how many answered,
 * and the estimate prefilled for the rest (decision 9).
 */
export async function currentMenuNumbers(eventId: string): Promise<{
  numbers: MenuNumbers;
  notDone: NotDone;
  allergyNotes: AllergyMenuGroup[];
  answers: AnswerSummary;
  prefill: Record<string, number>;
}> {
  const stats = await getGuestStats(eventId);
  const total = stats.menus.reduce((sum, m) => sum + m.count, 0);
  const unansweredPeople = stats.notDone.reduce((sum, g) => sum + (g.people ?? 1), 0);
  return {
    numbers: { menus: stats.menus, total, noMeal: stats.noMeal },
    notDone: stats.notDone,
    allergyNotes: stats.allergyNotes,
    answers: {
      answeredGuests: stats.total - stats.notDone.length,
      answeredPeople: total + stats.noMeal,
      unansweredGuests: stats.notDone.length,
      unansweredPeople,
    },
    prefill: prefillEstimate(stats.menus, unansweredPeople),
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

/**
 * Whether the current numbers differ from the latest sent ones (false when
 * nothing was sent). A sending with an estimate is compared with the real
 * counts plus what is left of it (`withRemainingEstimate`, 0184), so a guest
 * the estimate already counted answering doesn't read as a change.
 */
export function changedSince(latest: MenuSubmission | null, current: MenuNumbers, unansweredPeople = 0): boolean {
  return latest ? menuNumbersDiffer(sentNumbers(latest), withRemainingEstimate(current, latest, unansweredPeople)) : false;
}

/** What moved since the latest sending, per menu, on the same terms as `changedSince`. */
export function changesSince(latest: MenuSubmission | null, current: MenuNumbers, unansweredPeople = 0): { name: string; from: number; to: number }[] {
  return latest ? diffMenuNumbers(sentNumbers(latest), withRemainingEstimate(current, latest, unansweredPeople)) : [];
}

/**
 * Checks the couple's estimate against the event's menus: every key must be
 * one of them, every value a whole number ≥ 0. Returns the counts for all
 * menus (missing ones as 0) and their sum.
 */
export function cleanEstimate(menuIds: readonly string[], estimate: Record<string, number>): { counts: Record<string, number>; total: number } {
  for (const id of Object.keys(estimate)) if (!menuIds.includes(id)) throw new Error(ESTIMATE_MENU_ERROR);
  const counts = Object.fromEntries(menuIds.map((id) => [id, Math.max(0, Math.floor(estimate[id] ?? 0))]));
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/**
 * Saves a snapshot of the numbers for the venue, recomputed here. While
 * guests are unfinished the couple must send an `estimate` per menu for
 * them (decision 9; zeros are allowed) — stored apart from the real counts.
 * Allergy info is strict either/or: a non-blank `allergySummary` is stored
 * as-is and the raw notes are dropped; a blank one falls back to the raw
 * per-guest notes grouped by menu, so the venue is never left with nothing
 * just because the couple skipped it.
 */
export async function sendMenuNumbers(eventId: string, allergySummary?: string | null, estimate?: Record<string, number> | null): Promise<MenuSubmission> {
  const { numbers, notDone, allergyNotes, answers } = await currentMenuNumbers(eventId);
  if (numbers.menus.length === 0) throw new Error(NO_MENU_ERROR);
  let estimated: { counts: Record<string, number> | null; total: number } = { counts: null, total: 0 };
  if (notDone.length > 0) {
    if (!estimate) throw new Error(ESTIMATE_REQUIRED_ERROR);
    estimated = cleanEstimate(numbers.menus.map((m) => m.id), estimate);
  }

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
      no_meal_count: numbers.noMeal ?? 0,
      unanswered: notDone.length > 0 ? notDone.length : null,
      estimated_counts: estimated.counts,
      estimated_total: estimated.total,
      estimated_people: notDone.length > 0 ? answers.unansweredPeople : null,
      allergy_key: allergyKey(eventId, allergyNotes),
      allergy_summary: trimmedSummary,
      allergy_notes: trimmedSummary ? null : allergyNotes.length > 0 ? allergyNotes : null,
    })
    .select(SUBMISSION_COLUMNS)
    .single();
  if (error) throw error;
  return toMenuSubmission(data as unknown as MenuSubmissionRow);
}
