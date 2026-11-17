import "server-only";
import { timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { pseudonymize } from "@/lib/security/pseudonym";
import { getEventFeatures, eventHasFeature } from "@/lib/entitlements/server";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
import { INVITE_TOKEN_RE } from "@/lib/couple/rsvp";
import { matchGuestByName } from "@/lib/couple/rsvp-match";
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
//     through identifyGreetingSenderByName (same name-matching as the real
//     RSVP, so a later real answer lands on the same guest row) names a
//     guest, and the response carries a signed ticket naming them, valid
//     for a day.

export const GREETING_ALREADY_SENT_ERROR = "Веќе испративте честитка. Ви благодариме!";
export const GREETING_ANSWER_FIRST_ERROR = "Прво одговорете на поканата, па испратете честитка.";

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

type Sender = { eventId: string; guestId: string; fullName: string };

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
    const guestId = readGreetingTicket(eventId, who.ticket);
    if (!guestId) return null;
    query = query.eq("id", guestId);
  } else {
    return null;
  }
  const { data: guest, error: guestError } = await query.maybeSingle();
  if (guestError) throw guestError;
  return guest ? { eventId, guestId: guest.id, fullName: guest.full_name } : null;
}

async function senderFor(slug: string, who: GreetingSender): Promise<Sender & { options: GreetingOptions }> {
  const sender = await resolveGreetingSender(slug, who);
  if (!sender) throw new Error(GREETING_ANSWER_FIRST_ERROR);
  const options = await getGreetingOptions(sender.eventId);
  if (!options.enabled) throw new Error(LOCKED_MESSAGE);
  if (await hasGreeted(sender.guestId)) throw new Error(GREETING_ALREADY_SENT_ERROR);
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
    });
  } catch (err) {
    // Two tabs sent at once: the unique index on guest_id let one through.
    if ((err as { code?: string }).code === "23505") throw new Error(GREETING_ALREADY_SENT_ERROR);
    throw err;
  }
}

/**
 * The shared link's way to unlock the greeting box before answering: finds
 * the guest a typed name matches (same rule as the real RSVP — case-
 * insensitive, exact; 2+ matches counts as none, to avoid updating the
 * wrong person), or adds them as a new, not-yet-answered guest
 * (rsvp_status keeps its 'pending' default) when there's no match. Returns
 * null for a blank name or when the event has no greetings feature.
 */
export async function identifyGreetingSenderByName(slug: string, fullName: string): Promise<{ ticket: string; sent: boolean } | null> {
  const name = fullName.trim();
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
    .select("id, full_name, rsvp_status")
    .eq("event_id", eventId)
    .limit(MAX_LIST_ROWS);
  if (guestsError) throw guestsError;
  const match = matchGuestByName(checkListBound(guests, "event_guests (greeting identify)"), name);

  let guestId: string;
  if (match) {
    guestId = match.id;
  } else {
    const { data: created, error: insertError } = await client.from("event_guests").insert({ event_id: eventId, full_name: name }).select("id").single();
    if (insertError) throw insertError;
    guestId = created.id;
  }
  return { ticket: issueGreetingTicket(eventId, guestId), sent: await hasGreeted(guestId) };
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
  return { ...options, sent: sender && options.enabled ? await hasGreeted(sender.guestId) : false };
}
