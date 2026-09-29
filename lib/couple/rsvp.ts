import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAudit } from "@/lib/audit";
import { pseudonymize } from "@/lib/security/pseudonym";
import { matchGuestByName } from "@/lib/couple/rsvp-match";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

export interface RsvpInput {
  fullName: string;
  attending: boolean;
  partySize: number;
}

/** Who submitted, for the audit trail only: a salted hash, never the raw IP (SEC-021). */
export interface RsvpRequester {
  ip?: string;
  requestId?: string | null;
}

/**
 * Public RSVP entry point, reached from the invitation link (no couple
 * session — the slug itself is the access token). Matches the submitted name
 * against the couple's existing guest list (case-insensitive, exact) so a
 * guest the couple already added keeps whatever side/notes are already on
 * their row. An unmatched or ambiguous (2+ same-name) submission becomes a
 * new guest instead of risking an update to the wrong person.
 */
export async function submitRsvpBySlug(slug: string, input: RsvpInput, requester: RsvpRequester = {}): Promise<void> {
  const client = createServiceRoleClient();

  const { data: invitation, error: invitationError } = await client
    .from("event_invitations")
    .select("event_id, events(venue_id)")
    .eq("public_slug", slug)
    .maybeSingle();
  if (invitationError) throw invitationError;
  if (!invitation) throw new Error("Invitation not found.");

  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Name is required.");

  const status = input.attending ? "confirmed" : "declined";
  const partySize = input.attending ? Math.max(1, Math.floor(input.partySize)) : null;

  const { data: guests, error: guestsError } = await client
    .from("event_guests")
    .select("id, full_name, rsvp_status")
    .eq("event_id", invitation.event_id)
    .limit(MAX_LIST_ROWS);
  if (guestsError) throw guestsError;

  const match = matchGuestByName(checkListBound(guests, "event_guests (rsvp)"), fullName);

  const venueId = (invitation.events as unknown as { venue_id: string } | null)?.venue_id ?? null;
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
    const update: { rsvp_status: string; party_size?: number; rsvp_changed_via_link_at: string; rsvp_previous_status: string } = {
      rsvp_status: status,
      rsvp_changed_via_link_at: now,
      rsvp_previous_status: guest.rsvp_status,
    };
    if (partySize !== null) update.party_size = partySize;
    const { error } = await client.from("event_guests").update(update).eq("id", guest.id);
    if (error) throw error;
    await audit(guest.id, guest.rsvp_status);
    return;
  }

  const { data: created, error: insertError } = await client
    .from("event_guests")
    .insert({
      event_id: invitation.event_id,
      full_name: fullName,
      rsvp_status: status,
      party_size: partySize ?? 1,
      rsvp_changed_via_link_at: now,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  await audit(created.id, null);
}
