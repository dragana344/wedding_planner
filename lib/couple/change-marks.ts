import "server-only";
import { cache } from "react";
import { newGuestReplies } from "@/lib/changes/couple-notice";
import { groupBySection, unseenChanges } from "@/lib/changes/rules";
import { getCoupleFirstLogin, getSeen, listEventChanges } from "@/lib/changes/server";
import type { ChangeSection, EventChange } from "@/lib/changes/types";
import { todayIn } from "@/lib/date";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { MenuSubmission } from "@/lib/menu-numbers";
import { listGuestReplies, type GuestReply } from "./guest-replies";
import { listMenuSubmissions } from "./menu-submissions";

export type CoupleMarks = {
  /** The venue's changes the couple has not pressed Видено on, by section. */
  unseen: Partial<Record<ChangeSection, EventChange[]>>;
  /** The newest numbers the venue entered, while unseen. */
  venueNumbersUnseen: MenuSubmission | null;
  /** Guests' replies newer than what the couple has seen, newest first. */
  newReplies: GuestReply[];
};

export const NO_MARKS: CoupleMarks = { unseen: {}, venueNumbersUnseen: null, newReplies: [] };

/** Everything the couple screens mark as new. Nothing counts on a past event. */
export const loadCoupleMarks = cache(async (eventId: string): Promise<CoupleMarks> => {
  const { data: event, error } = await createServiceRoleClient().from("events").select("event_date").eq("id", eventId).maybeSingle();
  if (error) throw new Error(`Could not load the event: ${error.message}`);
  if (!event) return NO_MARKS;
  const eventDate = event.event_date as string;
  const today = todayIn();
  if (eventDate < today) return NO_MARKS;
  const [changes, seen, coupleFirstLoginAt, submissions, replies] = await Promise.all([
    listEventChanges(eventId),
    getSeen(eventId, "couple"),
    getCoupleFirstLogin(eventId),
    listMenuSubmissions(eventId, 1),
    listGuestReplies(eventId),
  ]);
  const latest = submissions[0];
  return {
    unseen: groupBySection(unseenChanges(changes, "couple", seen, { eventDate, today, coupleFirstLoginAt })),
    venueNumbersUnseen: latest && venueNumbersUnseen(latest, true, coupleFirstLoginAt, seen.menu_numbers) ? latest : null,
    newReplies: newGuestReplies(replies, seen.guest_replies, eventDate, today),
  };
});

/**
 * Whether numbers the venue entered are new to the couple: only while they
 * are the event's latest submission (a newer send supersedes them), entered
 * after the couple's first login (none without a login) and after Видено.
 * The caller has already ruled out past events.
 */
export function venueNumbersUnseen(s: MenuSubmission, isLatest: boolean, coupleFirstLoginAt: string | null, seenUpTo: string | undefined): boolean {
  return (
    s.source === "venue" &&
    isLatest &&
    coupleFirstLoginAt !== null &&
    Date.parse(s.sentAt) > Date.parse(coupleFirstLoginAt) &&
    (seenUpTo === undefined || Date.parse(s.sentAt) > Date.parse(seenUpTo))
  );
}

export type CoupleDots = { menu: boolean; guests: boolean; budget: boolean; notifications: boolean };

export function dotsFor(marks: CoupleMarks): CoupleDots {
  return {
    menu: Boolean(marks.unseen.menus?.length) || marks.venueNumbersUnseen !== null,
    guests: marks.newReplies.length > 0,
    budget: Boolean(marks.unseen.finance?.length),
    // Anything the notifications page would badge: venue changes, the venue's numbers, new guest replies.
    notifications: Object.values(marks.unseen).some((list) => (list?.length ?? 0) > 0) || marks.venueNumbersUnseen !== null || marks.newReplies.length > 0,
  };
}
