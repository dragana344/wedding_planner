import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { todayIn } from "@/lib/date";
import { errorFields, log } from "@/lib/log";
import { diffMenuNumbers, sentNumbers, withRemainingEstimate, type MenuNumbers } from "@/lib/menu-numbers";
import { allergyKey, currentMenuNumbers, listMenuSubmissions } from "./menu-submissions";

// Decision 10: once menu numbers were sent, any later change to the
// confirmed counts, menus, no-meal children or allergies leaves a change mark
// for the venue ("Промена по испратените бројки: +2 Месо"), section "numbers"
// (0182). Each mark stores the numbers it saw, so the next one only says what
// moved since — never the same change twice. After a sending with an
// estimate, the numbers compared are real + what is left of the estimate
// (0184, withRemainingEstimate). Only counts and menu names go
// in the log: no guest names, and allergies only as a yes/no plus a keyed
// fingerprint (see allergyKey).

/** Who changed it, as the venue reads it on the mark. */
export const GUEST_CHANGER = "Гостин";

type Snapshot = { menus?: { id: string; name: string; count: number }[]; noMeal?: number; allergyKey?: string | null };

/**
 * Compares the current numbers with the last sending (or the newest mark
 * after it) and writes a "numbers" mark when they moved. Returns whether a
 * mark was written. Nothing happens before the first sending, or once the
 * event is past.
 */
export async function recordNumbersChange(eventId: string, changedBy: string): Promise<boolean> {
  const client = createServiceRoleClient();
  const [latest] = await listMenuSubmissions(eventId, 1);
  if (!latest) return false;

  const [{ data: event, error: eventError }, { data: sub, error: subError }, { data: mark, error: markError }] = await Promise.all([
    client.from("events").select("event_date").eq("id", eventId).maybeSingle(),
    client.from("event_menu_submissions").select("allergy_key").eq("id", latest.id).maybeSingle(),
    client
      .from("event_changes")
      .select("new_value")
      .eq("event_id", eventId)
      .eq("section", "numbers")
      .gt("changed_at", latest.sentAt)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (eventError) throw eventError;
  if (subError) throw subError;
  if (markError) throw markError;
  if (!event || (event.event_date as string) < todayIn()) return false;

  const snap = (mark?.new_value ?? null) as Snapshot | null;
  // 0184: what the venue was told — a sending's estimate included — and
  // the same for now: the real counts plus what is left of that estimate,
  // so a guest it already counted answering is no change ("+2" twice).
  const baseline: MenuNumbers = snap
    ? { menus: snap.menus ?? [], total: (snap.menus ?? []).reduce((s, m) => s + m.count, 0), noMeal: snap.noMeal ?? 0 }
    : sentNumbers(latest);
  const baselineKey = snap ? (snap.allergyKey ?? null) : ((sub?.allergy_key as string | null | undefined) ?? null);

  const current = await currentMenuNumbers(eventId);
  const { allergyNotes } = current;
  const numbers = withRemainingEstimate(current.numbers, latest, current.answers.unansweredPeople);
  const key = allergyKey(eventId, allergyNotes);
  const changes = diffMenuNumbers(baseline, numbers);
  // A sending from before 0182 has no key: allergies are compared from the first mark on.
  const allergies = baselineKey !== null && baselineKey !== key;
  if (changes.length === 0 && !allergies) return false;

  const { error } = await client.from("event_changes").insert({
    event_id: eventId,
    section: "numbers",
    side: "couple",
    changed_by: changedBy,
    field: "after_sent",
    old_value: { submissionId: latest.id },
    new_value: { menus: numbers.menus, noMeal: numbers.noMeal ?? 0, allergyKey: key, changes, allergies },
  });
  if (error) throw error;
  return true;
}

/** Best effort after a guest write: the write itself has succeeded, so a failure here is only logged. */
export async function noteNumbersChange(eventId: string, changedBy: string): Promise<void> {
  try {
    await recordNumbersChange(eventId, changedBy);
  } catch (err) {
    log("error", "numbers_change_mark_failed", { event_id: eventId, ...errorFields(err) });
  }
}
