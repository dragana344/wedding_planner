import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { describeChange } from "@/lib/changes/format";
import { SECTION_LABELS, unseenChanges } from "@/lib/changes/rules";
import { getCoupleFirstLogin, getSeen, listEventChanges } from "@/lib/changes/server";
import type { SeenSection } from "@/lib/changes/types";
import { venueNumbersUnseen } from "@/lib/couple/change-marks";
import { STATUS_LABELS } from "@/lib/couple/guest-labels";
import type { RsvpStatus } from "@/lib/couple/guests";
import { listGuestReplies } from "@/lib/couple/guest-replies";
import { VENUE_TIME_ZONE, todayIn } from "@/lib/date";
import { estimateNote, NO_MEAL_LABEL, sentMeals, sentMenus, toMenuSubmission, type MenuSubmissionRow } from "@/lib/menu-numbers";
import { coupleReminderApplies, daysUntil } from "@/lib/menu-timeline";

export type CoupleNotification = {
  id: string;
  at: string;
  kind: "venue_change" | "guest_reply" | "reminder";
  section?: SeenSection;
  title: string;
  detail: string | null;
  unseen: boolean;
};

export const COUPLE_REMINDER_TEXT = "Испратете ги конечните бројки до салата";
export const VENUE_REMINDER_TEXT = "Салата ве потсети да ги испратите бројките";
const REMINDER_DAYS_BEFORE = 25;
const REMINDER_HOUR = 9;

/** The instant of `hour`:00 on a calendar date in the venue's time zone. */
function skopjeInstant(isoDate: string, hour: number): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: VENUE_TIME_ZONE, hour: "2-digit", hourCycle: "h23" });
  // Skopje is UTC+1 or UTC+2; take the offset that lands on the wanted local hour.
  for (const offset of [1, 2]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, hour - offset));
    if (Number(fmt.format(candidate)) === hour && todayIn(VENUE_TIME_ZONE, candidate) === isoDate) return candidate;
  }
  return new Date(Date.UTC(y, m - 1, d, hour - 1));
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** What the couple's notifications page lists, newest first. */
export async function listCoupleNotifications(eventId: string): Promise<CoupleNotification[]> {
  const client = createServiceRoleClient();
  const { data: event, error } = await client.from("events").select("event_date, created_at").eq("id", eventId).maybeSingle();
  if (error) throw new Error(`Could not load the event: ${error.message}`);
  if (!event) return [];
  const eventDate = event.event_date as string;
  const today = todayIn();
  const now = new Date();

  const [changes, seen, firstLogin, replies, submissions, reminders, seatingProposals, pendingAnswers] = await Promise.all([
    listEventChanges(eventId),
    getSeen(eventId, "couple"),
    getCoupleFirstLogin(eventId),
    listGuestReplies(eventId),
    client
      .from("event_menu_submissions")
      .select("id, sent_at, sent_by, counts, menu_titles, total, seen_at, seen_by, source, unanswered, allergy_summary, allergy_notes, no_meal_count, estimated_counts, estimated_total")
      .eq("event_id", eventId)
      .order("sent_at", { ascending: false })
      .order("id", { ascending: false }),
    client.from("event_couple_reminders").select("id, reminded_at").eq("event_id", eventId),
    client
      .from("event_seating_proposals")
      .select("id, proposed_by, status, note, created_at, responded_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    client
      .from("event_rsvp_answers")
      .select("created_at")
      .eq("event_id", eventId)
      .eq("review_state", "pending")
      .order("created_at", { ascending: false }),
  ]);
  if (submissions.error) throw new Error(`Could not load the menu numbers: ${submissions.error.message}`);
  if (reminders.error) throw new Error(`Could not load the reminders: ${reminders.error.message}`);
  if (seatingProposals.error) throw new Error(`Could not load the seating proposals: ${seatingProposals.error.message}`);
  if (pendingAnswers.error) throw new Error(`Could not load the answers to check: ${pendingAnswers.error.message}`);

  const out: CoupleNotification[] = [];

  // Nothing is shown before the couple's first login (the venue's setup is not a change).
  if (firstLogin !== null) {
    const unseenIds = new Set(unseenChanges(changes, "couple", seen, { eventDate, today, coupleFirstLoginAt: firstLogin }).map((c) => c.id));
    for (const c of changes) {
      if (c.side !== "venue" || Date.parse(c.changedAt) <= Date.parse(firstLogin)) continue;
      out.push({
        id: `chg-${c.id}`,
        at: c.changedAt,
        kind: "venue_change",
        section: c.section,
        title: SECTION_LABELS[c.section],
        detail: describeChange(c, { redactPrivate: false }),
        unseen: unseenIds.has(c.id),
      });
    }

    // Numbers the venue entered, or the cron auto-sent, for the couple: new by the Мени box's rule.
    const sent = ((submissions.data ?? []) as unknown as MenuSubmissionRow[]).map(toMenuSubmission);
    for (const [i, s] of sent.entries()) {
      if ((s.source !== "venue" && s.source !== "auto") || Date.parse(s.sentAt) <= Date.parse(firstLogin)) continue;
      const parts = [
        ...sentMenus(s).map((m) => `${m.name}: ${m.count}${m.estimated > 0 ? ` (${estimateNote(m.estimated)})` : ""}`),
        `Вкупно: ${sentMeals(s)}${s.estimate ? ` (${estimateNote(s.estimate.total)})` : ""}`,
      ];
      if ((s.numbers.noMeal ?? 0) > 0) parts.push(`${NO_MEAL_LABEL}: ${s.numbers.noMeal}`);
      if (s.source === "auto") parts.push(s.estimate ? "Испратено автоматски — гостите без одговор се проценети" : "Испратено автоматски — непотполно");
      out.push({
        id: `num-${s.id}`,
        at: s.sentAt,
        kind: "venue_change",
        section: "menu_numbers",
        title: s.source === "auto" ? "Автоматски испратени бројки" : "Внесено од салата",
        detail: parts.join(" · "),
        // The dot badge is reserved for numbers the venue itself entered (venueNumbersUnseen's own rule);
        // an auto-send is the couple's own non-response locked in, so it's never shown as new.
        unseen: eventDate >= today && venueNumbersUnseen(s, i === 0, firstLogin, seen.menu_numbers),
      });
    }
  }

  const repliesSeen = seen.guest_replies === undefined ? null : Date.parse(seen.guest_replies);
  for (const r of replies) {
    out.push({
      id: `rsvp-${r.id}`,
      at: r.at,
      kind: "guest_reply",
      title: r.review ? "Одговор за проверка" : (r.guestName ?? "Нов гостин"),
      detail: STATUS_LABELS[r.newStatus as RsvpStatus] ?? null,
      // Like every mark: nothing is new on a past event.
      unseen: eventDate >= today && (repliesSeen === null || Date.parse(r.at) > repliesSeen),
    });
  }

  // 0179: answers waiting in "Да се провери" stay new until the couple resolves them.
  const pendingCount = (pendingAnswers.data ?? []).length;
  if (pendingCount > 0) {
    out.push({
      id: `review-${eventId}`,
      at: pendingAnswers.data![0].created_at as string,
      kind: "guest_reply",
      title: `Да се провери: ${pendingCount} ${pendingCount === 1 ? "одговор" : "одговори"}`,
      detail: "Гости → Одговори: изберете чиј е секој одговор.",
      unseen: eventDate >= today,
    });
  }

  // Skipped for late events: created after the 25-day mark had passed.
  const createdDate = todayIn(VENUE_TIME_ZONE, new Date(event.created_at as string));
  if (eventDate >= today && (submissions.data ?? []).length === 0 && coupleReminderApplies(eventDate, createdDate)) {
    const due = skopjeInstant(addDays(eventDate, -REMINDER_DAYS_BEFORE), REMINDER_HOUR);
    if (due <= now && daysUntil(eventDate, today) <= REMINDER_DAYS_BEFORE) {
      out.push({ id: `rem25-${eventId}`, at: due.toISOString(), kind: "reminder", title: COUPLE_REMINDER_TEXT, detail: null, unseen: false });
    }
  }
  for (const r of reminders.data ?? []) {
    out.push({ id: `rem-${r.id}`, at: r.reminded_at as string, kind: "reminder", title: VENUE_REMINDER_TEXT, detail: null, unseen: false });
  }

  // Project A §5: the venue sending a layout is always couple-facing news;
  // the couple's own sent layout only becomes couple-facing news once the
  // venue has actually responded to it (a still-pending one is just "I sent
  // this," nothing happened yet to tell them about).
  for (const p of seatingProposals.data ?? []) {
    if (p.proposed_by === "venue") {
      out.push({ id: `seat-${p.id}`, at: p.created_at as string, kind: "venue_change", title: "Салата испрати распоред на седење", detail: null, unseen: false });
    } else if (p.status !== "pending") {
      const title = p.status === "approved" ? "Салата го одобри вашиот распоред" : "Салата го одби вашиот распоред";
      out.push({ id: `seat-${p.id}`, at: (p.responded_at as string) ?? (p.created_at as string), kind: "venue_change", title, detail: (p.note as string | null) ?? null, unseen: false });
    }
  }

  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
