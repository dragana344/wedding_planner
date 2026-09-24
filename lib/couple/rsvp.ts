import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface RsvpInput {
  fullName: string;
  attending: boolean;
  partySize: number;
}

/**
 * Public RSVP entry point, reached from the invitation link (no couple
 * session — the slug itself is the access token). Matches the submitted name
 * against the couple's existing guest list (case-insensitive, exact) so a
 * guest the couple already added keeps whatever side/notes are already on
 * their row. An unmatched or ambiguous (2+ same-name) submission becomes a
 * new guest instead of risking an update to the wrong person.
 */
export async function submitRsvpBySlug(slug: string, input: RsvpInput): Promise<void> {
  const client = createServiceRoleClient();

  const { data: invitation, error: invitationError } = await client
    .from("event_invitations")
    .select("event_id")
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
    .select("id, full_name")
    .eq("event_id", invitation.event_id);
  if (guestsError) throw guestsError;

  const normalized = fullName.toLowerCase();
  const matches = (guests ?? []).filter((g) => g.full_name.trim().toLowerCase() === normalized);

  if (matches.length === 1) {
    const update: { rsvp_status: string; party_size?: number } = { rsvp_status: status };
    if (partySize !== null) update.party_size = partySize;
    const { error } = await client.from("event_guests").update(update).eq("id", matches[0].id);
    if (error) throw error;
    return;
  }

  const { error: insertError } = await client.from("event_guests").insert({
    event_id: invitation.event_id,
    full_name: fullName,
    rsvp_status: status,
    party_size: partySize ?? 1,
  });
  if (insertError) throw insertError;
}
