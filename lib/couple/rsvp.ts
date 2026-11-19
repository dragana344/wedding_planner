import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAudit } from "@/lib/audit";
import { pseudonymize } from "@/lib/security/pseudonym";
import { decideSharedMatch } from "@/lib/couple/rsvp-match";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";
import { RSVP_GUEST_LIMIT_ERROR, RSVP_NOT_FOUND_ERROR, RSVP_REQUIRED_ERROR } from "@/lib/api/schemas";
import { emailConfigured, sendEmail } from "@/lib/email";
import { log } from "@/lib/log";
import { STATUS_LABELS } from "@/lib/couple/guest-labels";
import { eventHasFeature } from "@/lib/entitlements/server";
import type { RsvpStatus } from "@/lib/couple/guests";
import type { MenuCounts } from "@/lib/couple/guest-menus";
import type { AnswerMatch } from "@/lib/couple/rsvp-answer-view";
import { applyAnswer, insertAnswer, prepareAnswer, type ApplyTarget } from "@/lib/couple/rsvp-answers";
import { issueRememberToken, readRememberToken } from "@/lib/couple/rsvp-remember";
import { assertGuestCanAnswer } from "@/lib/couple/rsvp-window";

export type RsvpAnswer = "confirmed" | "declined" | "later";

export interface RsvpInput {
  /** Required unless `guestToken` names the guest. */
  fullName?: string;
  /** The guest's personal invite token (`?g=` on their link, A1). */
  guestToken?: string;
  status: RsvpAnswer;
  partySize: number;
  /** Party details, kept only with a yes (A4, A5). */
  childrenCount?: number;
  /** How many of the party eat each of the event's menus (menu id -> count). */
  menuCounts?: MenuCounts;
  /** Of the children: how many eat no adult menu (0181). */
  noMealCount?: number;
  allergies?: string | null;
  /** Optional note to the couple, kept with any answer (A3). */
  comment?: string | null;
  /** Optional names of the people coming with the guest (0179). */
  householdNames?: (string | null)[] | null;
  /** Shared link only: an optional phone that helps find the guest. */
  phone?: string | null;
  /** Shared link only: this browser's token from an earlier applied answer. */
  remember?: string | null;
}

/** What a guest's own invitation page shows about them. */
export interface Invitee {
  fullName: string;
  rsvpStatus: string;
  partySize: number;
  childrenCount: number;
  menuCounts: MenuCounts;
  /** Children eating no adult menu (0181). */
  noMealCount?: number;
  allergies: string | null;
  rsvpComment: string | null;
  /** Names of the people coming with them, from their last answer (0179). */
  householdNames?: string[];
  /**
   * When they last answered (0180): their newest answer, or for a guest the
   * couple marked themselves, when the guest was added. Compared with a
   * date change to ask a "yes" to confirm again.
   */
  answeredAt?: string | null;
}

/** Same shape the column check enforces (0060); anything else is not worth a query. */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

/**
 * The guest behind a personal invite link, or null when the token is
 * malformed, unknown, or belongs to another event's guest (the page then
 * falls back to the generic invitation).
 */
export async function getInviteeByToken(slug: string, token: string): Promise<Invitee | null> {
  if (!INVITE_TOKEN_RE.test(token)) return null;
  const client = createServiceRoleClient();
  const { data: invitation, error: invitationError } = await client
    .from("event_invitations")
    .select("event_id")
    .eq("public_slug", slug)
    .maybeSingle();
  if (invitationError) throw invitationError;
  if (!invitation) return null;
  // Without the package feature a ?g= link is just the shared invitation.
  if (!(await eventHasFeature(invitation.event_id, "personal_invite_links"))) return null;

  const { data: guest, error } = await client
    .from("event_guests")
    .select("full_name, rsvp_status, party_size, children_count, no_meal_count, id, allergies, rsvp_comment, household_names, rsvp_changed_via_link_at, created_at")
    .eq("event_id", invitation.event_id)
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!guest) return null;
  const [{ data: counts, error: countsError }, { data: lastAnswer, error: lastAnswerError }] = await Promise.all([
    client.from("event_guest_menu_counts").select("menu_template_id, count").eq("guest_id", guest.id),
    client
      .from("event_rsvp_answers")
      .select("created_at")
      .eq("guest_id", guest.id)
      .in("review_state", ["none", "applied"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (countsError) throw countsError;
  if (lastAnswerError) throw lastAnswerError;
  const answeredAt = [lastAnswer?.created_at, guest.rsvp_changed_via_link_at]
    .filter((t): t is string => Boolean(t))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return {
    fullName: guest.full_name,
    rsvpStatus: guest.rsvp_status,
    partySize: guest.party_size,
    childrenCount: guest.children_count,
    menuCounts: Object.fromEntries((counts ?? []).map((r) => [r.menu_template_id, r.count])),
    noMealCount: guest.no_meal_count ?? 0,
    allergies: guest.allergies,
    rsvpComment: guest.rsvp_comment,
    householdNames: (guest.household_names as string[] | null) ?? [],
    answeredAt: answeredAt ?? guest.created_at,
  };
}

/** Who submitted, for the audit trail only: a salted hash, never the raw IP (SEC-021). */
export interface RsvpRequester {
  ip?: string;
  requestId?: string | null;
}

/**
 * What became of an answer. `guestId` is null while it waits for the couple
 * ("Да се провери"); `remember` is the shared link's token for this browser,
 * set only when the answer was applied to a guest.
 */
export interface RsvpResult {
  eventId: string;
  guestId: string | null;
  /** The stored answer; for a pending one, what a greeting sent right after it is tied to (0180). */
  answerId: string | null;
  remember: string | null;
}

/** The package's guest limit trigger (0086/0122), the one P0001 a new guest can hit. */
function isGuestLimitError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === "P0001" && typeof e.message === "string" && e.message.startsWith("Достигнат е лимитот од ") && e.message.includes("гости");
}

/**
 * Public RSVP entry point, reached from the invitation link (no couple
 * session — the slug itself is the access token). Every answer is kept in
 * event_rsvp_answers (0179) and applied through `applyAnswer`.
 *
 * A personal link's token names the guest directly; one from another event,
 * or an unknown one, is rejected. On the shared link `decideSharedMatch`
 * picks the guest: the one this browser remembers, the one with the typed
 * phone, or the one with exactly the typed name; nobody close → a new
 * guest. Anything unsure (namesakes, a match only across scripts, phone and
 * name pointing at different guests) is stored for the couple to resolve
 * and changes nobody — the guest is thanked the same way either way, and
 * never told about other guests.
 */
export async function submitRsvpBySlug(slug: string, input: RsvpInput, requester: RsvpRequester = {}): Promise<RsvpResult> {
  const client = createServiceRoleClient();

  const { data: invitation, error: invitationError } = await client
    .from("event_invitations")
    .select("event_id, events(venue_id, contact_email)")
    .eq("public_slug", slug)
    .maybeSingle();
  if (invitationError) throw invitationError;
  if (!invitation) throw new Error(RSVP_NOT_FOUND_ERROR);
  const eventId = invitation.event_id as string;

  const fullName = (input.fullName ?? "").trim();
  if (!input.guestToken && !fullName) throw new Error(RSVP_REQUIRED_ERROR);

  // 0180: after the venue's deadline, the event's day, or a cancellation the
  // guest's own form is closed — on every link. The couple can still record
  // an answer themselves (recordCoupleAnswer never comes here).
  await assertGuestCanAnswer(eventId);

  // Checked before anything is written (children, menus for 2+).
  const answer = await prepareAnswer(eventId, input);

  const eventInfo = invitation.events as unknown as { venue_id: string; contact_email: string | null } | null;
  const audit = (guestId: string | null, previousStatus: string | null, review = false) =>
    recordAudit({
      action: "public_rsvp",
      actorType: "guest",
      venueId: eventInfo?.venue_id ?? null,
      eventId,
      targetId: guestId,
      requestId: requester.requestId ?? null,
      details: {
        previous_status: previousStatus,
        new_status: answer.status,
        ...(review ? { review: true } : {}),
        requester: requester.ip ? pseudonymize(`rsvp:${eventId}`, requester.ip).slice(0, 16) : null,
      },
    });

  let target: { to: ApplyTarget; match: AnswerMatch };
  if (input.guestToken) {
    if (!INVITE_TOKEN_RE.test(input.guestToken)) throw new Error(RSVP_NOT_FOUND_ERROR);
    if (!(await eventHasFeature(eventId, "personal_invite_links"))) throw new Error(RSVP_NOT_FOUND_ERROR);
    const { data: guest, error } = await client
      .from("event_guests")
      .select("id")
      .eq("event_id", eventId)
      .eq("invite_token", input.guestToken)
      .maybeSingle();
    if (error) throw error;
    if (!guest) throw new Error(RSVP_NOT_FOUND_ERROR);
    target = { to: { guestId: guest.id }, match: "personal" };
  } else {
    const { data: guests, error: guestsError } = await client
      .from("event_guests")
      .select("id, full_name, phone")
      .eq("event_id", eventId)
      .limit(MAX_LIST_ROWS);
    if (guestsError) throw guestsError;
    const decision = decideSharedMatch(checkListBound(guests, "event_guests (rsvp)"), {
      fullName,
      phone: input.phone,
      rememberedGuestId: readRememberToken(eventId, input.remember),
    });
    if (decision.kind === "review") {
      const answerId = await insertAnswer({
        eventId, guestId: null, source: "shared", fullName, phone: input.phone ?? null, answer,
        match: "review", reviewState: "pending", reviewReason: null, before: null, after: null,
      });
      await audit(null, null, true);
      return { eventId, guestId: null, answerId, remember: null };
    }
    target = decision.kind === "new" ? { to: { newGuestName: fullName }, match: "new" } : { to: { guestId: decision.guestId }, match: decision.match };
  }

  // SEC-021: anyone with the link can answer for a listed guest (guests may
  // change their mind), so every change is recorded with what it replaced.
  // One transaction (0184): a new guest, the answer and its row together.
  const shared = !input.guestToken;
  let applied;
  try {
    applied = await applyAnswer(eventId, target.to, answer, {
      viaLink: true,
      phone: shared ? input.phone : null,
      record: { source: shared ? "shared" : "personal", fullName: shared ? fullName : null, phone: shared ? (input.phone ?? null) : null, match: target.match },
    });
  } catch (err) {
    if (!("newGuestName" in target.to) || !isGuestLimitError(err)) throw err;
    // 0180: the package's guest limit. Nothing was created; the answer is
    // kept for the couple ("Да се провери", with the reason) and the guest
    // gets a neutral message.
    await insertAnswer({
      eventId, guestId: null, source: "shared", fullName, phone: input.phone ?? null, answer,
      match: "review", reviewState: "pending", reviewReason: "guest_limit", before: null, after: null,
    });
    await audit(null, null, true);
    throw new Error(RSVP_GUEST_LIMIT_ERROR);
  }
  const answerId = applied.answerId;
  const previous = applied.before?.status ?? null;
  await audit(applied.guestId, previous);
  if (previous && ANSWERS.has(previous) && previous !== answer.status && eventInfo?.contact_email) {
    await notifyCoupleOfChange(eventInfo.contact_email, applied.guestName, previous, answer.status, answer.comment);
  }
  return { eventId, guestId: applied.guestId, answerId, remember: shared ? issueRememberToken(eventId, applied.guestId) : null };
}

/** Statuses a guest has actually answered with; a change from one of these is news to the couple. */
const ANSWERS = new Set(["confirmed", "declined", "later"]);

/**
 * A11: tells the couple a guest changed an earlier answer. Best effort: the
 * guest's answer is already saved, so a failed email is only logged.
 */
async function notifyCoupleOfChange(to: string, guestName: string, from: string, next: string, comment: string | null): Promise<void> {
  if (!emailConfigured()) return;
  const label = (s: string) => STATUS_LABELS[s as RsvpStatus] ?? s;
  const text =
    `${guestName} го смени одговорот на поканата: ${label(from)} → ${label(next)}.` +
    (comment ? `\nПорака: ${comment}` : "") +
    "\nДеталите се во листата на гости.";
  try {
    await sendEmail({ to, subject: `Промена на одговор: ${guestName}`, text });
  } catch (err) {
    log("error", "rsvp_change_email_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}
