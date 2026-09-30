import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAudit } from "@/lib/audit";
import { pseudonymize } from "@/lib/security/pseudonym";
import { matchGuestByName } from "@/lib/couple/rsvp-match";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";
import { RSVP_NOT_FOUND_ERROR, RSVP_REQUIRED_ERROR } from "@/lib/api/schemas";
import { emailConfigured, sendEmail } from "@/lib/email";
import { log } from "@/lib/log";
import { STATUS_LABELS } from "@/lib/couple/guest-labels";
import type { RsvpStatus } from "@/lib/couple/guests";

export type RsvpAnswer = "confirmed" | "declined" | "later";
export type MenuChoice = "standard" | "posno" | "vegetarian";

export interface RsvpInput {
  /** Required unless `guestToken` names the guest. */
  fullName?: string;
  /** The guest's personal invite token (`?g=` on their link, A1). */
  guestToken?: string;
  status: RsvpAnswer;
  partySize: number;
  /** Party details, kept only with a yes (A4, A5). */
  childrenCount?: number;
  menuChoice?: MenuChoice | null;
  allergies?: string | null;
  /** Optional note to the couple, kept with any answer (A3). */
  comment?: string | null;
}

/** Trimmed text, or null when blank. */
function cleanText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/** What a guest's own invitation page shows about them. */
export interface Invitee {
  fullName: string;
  rsvpStatus: string;
  partySize: number;
  childrenCount: number;
  menuChoice: string | null;
  allergies: string | null;
  rsvpComment: string | null;
}

/** Same shape the column check enforces (0060); anything else is not worth a query. */
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

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

  const { data: guest, error } = await client
    .from("event_guests")
    .select("full_name, rsvp_status, party_size, children_count, menu_choice, allergies, rsvp_comment")
    .eq("event_id", invitation.event_id)
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!guest) return null;
  return {
    fullName: guest.full_name,
    rsvpStatus: guest.rsvp_status,
    partySize: guest.party_size,
    childrenCount: guest.children_count,
    menuChoice: guest.menu_choice,
    allergies: guest.allergies,
    rsvpComment: guest.rsvp_comment,
  };
}

/** Who submitted, for the audit trail only: a salted hash, never the raw IP (SEC-021). */
export interface RsvpRequester {
  ip?: string;
  requestId?: string | null;
}

/**
 * Public RSVP entry point, reached from the invitation link (no couple
 * session — the slug itself is the access token). A personal link's token
 * names the guest directly; one from another event, or an unknown one, is
 * rejected. Without a token, matches the submitted name
 * against the couple's existing guest list (case-insensitive, exact) so a
 * guest the couple already added keeps whatever side/notes are already on
 * their row. An unmatched or ambiguous (2+ same-name) submission becomes a
 * new guest instead of risking an update to the wrong person.
 */
export async function submitRsvpBySlug(slug: string, input: RsvpInput, requester: RsvpRequester = {}): Promise<void> {
  const client = createServiceRoleClient();

  const { data: invitation, error: invitationError } = await client
    .from("event_invitations")
    .select("event_id, events(venue_id, contact_email)")
    .eq("public_slug", slug)
    .maybeSingle();
  if (invitationError) throw invitationError;
  if (!invitation) throw new Error(RSVP_NOT_FOUND_ERROR);

  const fullName = (input.fullName ?? "").trim();
  if (!input.guestToken && !fullName) throw new Error(RSVP_REQUIRED_ERROR);

  const status = input.status;
  const attending = status === "confirmed";
  const partySize = attending ? Math.max(1, Math.floor(input.partySize)) : null;

  // With a yes, the party details replace what was there; otherwise they stay
  // (a guest answering "later" or "no" keeps the couple's numbers intact).
  const answer: Record<string, string | number | null> = { rsvp_comment: cleanText(input.comment) };
  if (attending) {
    answer.party_size = partySize!;
    answer.children_count = Math.max(0, Math.floor(input.childrenCount ?? 0));
    answer.menu_choice = input.menuChoice ?? null;
    answer.allergies = cleanText(input.allergies);
  }

  let match: { id: string; full_name: string; rsvp_status: string } | null;
  if (input.guestToken) {
    if (!INVITE_TOKEN_RE.test(input.guestToken)) throw new Error(RSVP_NOT_FOUND_ERROR);
    const { data: guest, error } = await client
      .from("event_guests")
      .select("id, full_name, rsvp_status")
      .eq("event_id", invitation.event_id)
      .eq("invite_token", input.guestToken)
      .maybeSingle();
    if (error) throw error;
    if (!guest) throw new Error(RSVP_NOT_FOUND_ERROR);
    match = guest;
  } else {
    const { data: guests, error: guestsError } = await client
      .from("event_guests")
      .select("id, full_name, rsvp_status")
      .eq("event_id", invitation.event_id)
      .limit(MAX_LIST_ROWS);
    if (guestsError) throw guestsError;
    match = matchGuestByName(checkListBound(guests, "event_guests (rsvp)"), fullName);
  }

  const eventInfo = invitation.events as unknown as { venue_id: string; contact_email: string | null } | null;
  const venueId = eventInfo?.venue_id ?? null;
  const now = new Date().toISOString();
  const audit = (guestId: string, previousStatus: string | null) =>
    recordAudit({
      action: "public_rsvp",
      actorType: "guest",
      venueId,
      eventId: invitation.event_id,
      targetId: guestId,
      requestId: requester.requestId ?? null,
      details: {
        previous_status: previousStatus,
        new_status: status,
        requester: requester.ip ? pseudonymize(`rsvp:${invitation.event_id}`, requester.ip).slice(0, 16) : null,
      },
    });

  // SEC-021: anyone with the link can answer for a listed guest (guests may
  // change their mind), so every change is recorded and the couple sees on
  // the guest when the link last changed it and what it was before.
  if (match) {
    const guest = match;
    const { error } = await client
      .from("event_guests")
      .update({ ...answer, rsvp_status: status, rsvp_changed_via_link_at: now, rsvp_previous_status: guest.rsvp_status })
      .eq("id", guest.id);
    if (error) throw error;
    await audit(guest.id, guest.rsvp_status);
    if (ANSWERS.has(guest.rsvp_status) && guest.rsvp_status !== status && eventInfo?.contact_email) {
      await notifyCoupleOfChange(eventInfo.contact_email, guest.full_name, guest.rsvp_status, status, cleanText(input.comment));
    }
    return;
  }

  const { data: created, error: insertError } = await client
    .from("event_guests")
    .insert({
      event_id: invitation.event_id,
      full_name: fullName,
      ...answer,
      rsvp_status: status,
      party_size: partySize ?? 1,
      rsvp_changed_via_link_at: now,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  await audit(created.id, null);
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
