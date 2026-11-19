import "server-only";
import { timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { pseudonymize } from "@/lib/security/pseudonym";
import { getEventFeatures, eventHasFeature } from "@/lib/entitlements/server";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
import { INVITE_TOKEN_RE } from "@/lib/couple/rsvp";
import { decideSharedMatch } from "@/lib/couple/rsvp-match";
import { readRememberToken } from "@/lib/couple/rsvp-remember";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";
import { createGreeting } from "@/lib/media/greetings";
import { createVideoUpload } from "@/lib/media/videos";
import { fitsVideoLength, videoSecondsLimit, videoTooLongError } from "@/lib/media/limits";

// Greetings sent back with the invitation (0151, and 0152's "before
// answering" relaxation): a guest can send the couple a message and a video
// whether or not they've answered the RSVP yet, and whatever they answer.
// Each greeting belongs to a guest on the list, one per guest:
//   * on a personal link the `?g=` token names the guest, so nothing else is
//     needed — identify() below is for the shared link only;
//   * on the shared link, either a real RSVP answer or just typing a name
//     through identifyGreetingSenderByName (the RSVP's matching, sure
//     matches only — 0179) names a guest, and the response carries a
//     signed ticket naming them, valid for a day;
//   * an answer that waits for the couple ("Да се провери", 0180) names no
//     guest yet: its ticket names the answer instead, the greeting is kept
//     with that answer and moves to the guest the couple picks
//     (attachAnswerGreeting in lib/couple/rsvp-answers.ts).

export const GREETING_ALREADY_SENT_ERROR = "Веќе испративте честитка. Ви благодариме!";
export const GREETING_ANSWER_FIRST_ERROR = "Прво одговорете на поканата, па испратете честитка.";
/** Identify could not tell for sure who the guest is: the RSVP answer sorts it out. */
export const GREETING_IDENTIFY_ANSWER_FIRST_ERROR = "Не ве најдовме со сигурност на листата. Прво одговорете на поканата погоре — потоа можете да испратите честитка.";

const TICKET_SECONDS = 24 * 60 * 60;

export type GreetingSender = { guestToken?: string | null; ticket?: string | null };

/** What the invitation offers: greetings at all, and how long a video may be (0 = no video, null = no limit). */
export type GreetingOptions = { enabled: boolean; videoSeconds: number | null };

function ticketSignature(eventId: string, body: string): string {
  return pseudonymize(`greeting-ticket:${eventId}`, body);
}

export function issueGreetingTicket(eventId: string, guestId: string, now = Date.now()): string {
  const body = `${guestId}.${Math.floor(now / 1000) + TICKET_SECONDS}`;
  return `${body}.${ticketSignature(eventId, body)}`;
}

/** A ticket for a pending answer (0180): "a.<answer id>.<expiry>.<signature>", never mistaken for a guest's. */
export function issueAnswerGreetingTicket(eventId: string, answerId: string, now = Date.now()): string {
  const body = `a.${answerId}.${Math.floor(now / 1000) + TICKET_SECONDS}`;
  return `${body}.${ticketSignature(eventId, body)}`;
}

/** The answer an answer ticket names, or null (malformed, expired, another event, or a guest ticket). */
export function readAnswerGreetingTicket(eventId: string, ticket: string, now = Date.now()): string | null {
  const match = /^a\.([0-9a-f-]{36})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(ticket);
  if (!match) return null;
  const [, answerId, expires, signature] = match;
  if (Number(expires) * 1000 < now) return null;
  const expected = Buffer.from(ticketSignature(eventId, `a.${answerId}.${expires}`));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? answerId : null;
}

/** The guest a ticket names, or null when it is malformed, expired or for another event. */
export function readGreetingTicket(eventId: string, ticket: string, now = Date.now()): string | null {
  const match = /^([0-9a-f-]{36})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(ticket);
  if (!match) return null;
  const [, guestId, expires, signature] = match;
  if (Number(expires) * 1000 < now) return null;
  const expected = Buffer.from(ticketSignature(eventId, `${guestId}.${expires}`));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? guestId : null;
}

export async function getGreetingOptions(eventId: string): Promise<GreetingOptions> {
  const features = await getEventFeatures(eventId);
  return {
    enabled: features.guest_greetings.enabled,
    videoSeconds: features.guest_greetings.enabled && features.video_greetings.enabled ? videoSecondsLimit(features.max_video_seconds) : 0,
  };
}

export async function hasGreeted(guestId: string): Promise<boolean> {
  const { count, error } = await createServiceRoleClient()
    .from("event_greetings")
    .select("id", { count: "exact", head: true })
    .eq("guest_id", guestId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Whether a greeting was already sent with this pending answer (one per answer, 0180). */
export async function answerHasGreeting(answerId: string): Promise<boolean> {
  const { count, error } = await createServiceRoleClient()
    .from("event_greetings")
    .select("id", { count: "exact", head: true })
    .eq("rsvp_answer_id", answerId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Who a greeting is from: a guest, or (0180) an answer still waiting for the couple. */
type Sender = { eventId: string; guestId: string | null; answerId: string | null; fullName: string };

function senderHasGreeted(sender: Sender): Promise<boolean> {
  return sender.guestId ? hasGreeted(sender.guestId) : answerHasGreeting(sender.answerId!);
}

/**
 * The sender behind an answer ticket: once the couple applied the answer to
 * a guest, that guest; while it waits (or was ignored), the answer itself.
 */
async function answerSender(eventId: string, answerId: string): Promise<Sender | null> {
  const client = createServiceRoleClient();
  const { data: answer, error } = await client
    .from("event_rsvp_answers")
    .select("id, full_name, guest_id, review_state")
    .eq("id", answerId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!answer) return null;
  if ((answer.review_state === "applied" || answer.review_state === "linked") && answer.guest_id) {
    const { data: guest, error: guestError } = await client.from("event_guests").select("id, full_name").eq("id", answer.guest_id).maybeSingle();
    if (guestError) throw guestError;
    if (guest) return { eventId, guestId: guest.id, answerId: null, fullName: guest.full_name };
  }
  return { eventId, guestId: null, answerId: answer.id, fullName: answer.full_name };
}

/** The guest behind a personal token or an RSVP ticket on this invitation; null when neither names one. */
export async function resolveGreetingSender(slug: string, who: GreetingSender): Promise<Sender | null> {
  const client = createServiceRoleClient();
  const { data: invitation, error } = await client.from("event_invitations").select("event_id").eq("public_slug", slug).maybeSingle();
  if (error) throw error;
  if (!invitation) return null;
  const eventId = invitation.event_id as string;

  let query = client.from("event_guests").select("id, full_name").eq("event_id", eventId);
  if (who.guestToken) {
    if (!INVITE_TOKEN_RE.test(who.guestToken)) return null;
    if (!(await eventHasFeature(eventId, "personal_invite_links"))) return null;
    query = query.eq("invite_token", who.guestToken);
  } else if (who.ticket) {
    const answerId = readAnswerGreetingTicket(eventId, who.ticket);
    if (answerId) return answerSender(eventId, answerId);
    const guestId = readGreetingTicket(eventId, who.ticket);
    if (!guestId) return null;
    query = query.eq("id", guestId);
  } else {
    return null;
  }
  const { data: guest, error: guestError } = await query.maybeSingle();
  if (guestError) throw guestError;
  return guest ? { eventId, guestId: guest.id, answerId: null, fullName: guest.full_name } : null;
}

async function senderFor(slug: string, who: GreetingSender): Promise<Sender & { options: GreetingOptions }> {
  const sender = await resolveGreetingSender(slug, who);
  if (!sender) throw new Error(GREETING_ANSWER_FIRST_ERROR);
  const options = await getGreetingOptions(sender.eventId);
  if (!options.enabled) throw new Error(LOCKED_MESSAGE);
  if (await senderHasGreeted(sender)) throw new Error(GREETING_ALREADY_SENT_ERROR);
  return { ...sender, options };
}

/** A signed upload for the greeting's video, if the package allows a video of this length. */
export async function startInvitationGreetingVideo(
  slug: string,
  who: GreetingSender,
  video: { bytes: number; seconds?: number | null },
): Promise<{ path: string; token: string; bucket: string }> {
  const sender = await senderFor(slug, who);
  const limit = sender.options.videoSeconds;
  if (limit === 0) throw new Error(LOCKED_MESSAGE);
  if (!fitsVideoLength(limit, video.seconds)) throw new Error(videoTooLongError(limit!));
  return createVideoUpload(sender.eventId, video.bytes);
}

export async function sendInvitationGreeting(
  slug: string,
  who: GreetingSender,
  input: { message: string; videoPath?: string | null },
): Promise<{ id: string }> {
  const sender = await senderFor(slug, who);
  if (input.videoPath && sender.options.videoSeconds === 0) throw new Error(LOCKED_MESSAGE);
  const [firstName, ...rest] = sender.fullName.trim().split(/\s+/);
  try {
    return await createGreeting(sender.eventId, {
      firstName: firstName.slice(0, 60),
      lastName: rest.join(" ").slice(0, 60),
      message: input.message,
      videoPath: input.videoPath,
      guestId: sender.guestId,
      rsvpAnswerId: sender.answerId,
    });
  } catch (err) {
    // Two tabs sent at once: the unique index on guest_id (or rsvp_answer_id) let one through.
    if ((err as { code?: string }).code === "23505") throw new Error(GREETING_ALREADY_SENT_ERROR);
    throw err;
  }
}

/**
 * The shared link's way to unlock the greeting box before answering. Uses
 * the RSVP's own matching (0179, `decideSharedMatch`) but only its sure
 * answers: the guest this browser remembers, the one guest with the typed
 * phone whose name also fits, or the one guest with exactly this name.
 * Anything else — a name nobody has, namesakes, a match only across
 * scripts, a phone with a name that doesn't fit — creates nothing and gets
 * the very same "answer the invitation first" error, so the box never tells
 * whether a name or phone is on the list (the answer then finds or creates
 * the guest, or goes to the couple to check). Returns null for a blank
 * name, an unknown invitation, or an event without greetings — none of
 * which depend on the list.
 */
export async function identifyGreetingSenderByName(
  slug: string,
  who: { fullName: string; phone?: string | null; remember?: string | null },
): Promise<{ ticket: string; sent: boolean } | null> {
  const name = who.fullName.trim();
  if (!name) return null;
  const client = createServiceRoleClient();
  const { data: invitation, error } = await client.from("event_invitations").select("event_id").eq("public_slug", slug).maybeSingle();
  if (error) throw error;
  if (!invitation) return null;
  const eventId = invitation.event_id as string;

  const options = await getGreetingOptions(eventId);
  if (!options.enabled) return null;

  const { data: guests, error: guestsError } = await client
    .from("event_guests")
    .select("id, full_name, phone")
    .eq("event_id", eventId)
    .limit(MAX_LIST_ROWS);
  if (guestsError) throw guestsError;
  const decision = decideSharedMatch(checkListBound(guests, "event_guests (greeting identify)"), {
    fullName: name,
    phone: who.phone,
    rememberedGuestId: readRememberToken(eventId, who.remember),
  });
  if (decision.kind !== "apply") throw new Error(GREETING_IDENTIFY_ANSWER_FIRST_ERROR);
  return { ticket: issueGreetingTicket(eventId, decision.guestId), sent: await hasGreeted(decision.guestId) };
}

/** What the invitation page shows: the event's options, and whether this personal-link guest already sent one. */
export type InvitationGreetingState = GreetingOptions & { sent: boolean };

export async function getInvitationGreetingState(slug: string, guestToken?: string): Promise<InvitationGreetingState | null> {
  const sender = guestToken ? await resolveGreetingSender(slug, { guestToken }) : null;
  let eventId = sender?.eventId;
  if (!eventId) {
    const { data, error } = await createServiceRoleClient().from("event_invitations").select("event_id").eq("public_slug", slug).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    eventId = data.event_id as string;
  }
  const options = await getGreetingOptions(eventId);
  return { ...options, sent: sender && options.enabled ? await senderHasGreeted(sender) : false };
}
