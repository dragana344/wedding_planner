import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { emailConfigured, sendEmail } from "@/lib/email";
import { log } from "@/lib/log";
import { GUEST_COLUMNS, type Guest, type GuestSide, type InvitationChannel } from "@/lib/couple/guests";
import { inviteMessage, personalInviteUrl } from "@/lib/couple/invite-share";

/**
 * A8/A9: record that the couple sent these guests the invitation (this
 * event's guests only; with `side`, a co-organizer's own side only, A12).
 */
export async function markInvitationSent(
  eventId: string,
  guestIds: string[],
  channel: InvitationChannel,
  side: GuestSide | null = null,
): Promise<Guest[]> {
  if (guestIds.length === 0) return [];
  const client = createServiceRoleClient();
  let query = client
    .from("event_guests")
    .update({ invitation_sent_at: new Date().toISOString(), invitation_channel: channel })
    .eq("event_id", eventId)
    .in("id", guestIds);
  if (side) query = query.eq("side", side);
  const { data, error } = await query.select(GUEST_COLUMNS);
  if (error) throw error;
  return data;
}

/**
 * A9: emails each listed guest their personal invitation link through Resend
 * and marks the ones that went out. Guests without an email are skipped (the
 * couple sends those by WhatsApp/Viber/SMS). `origin` is the site the link
 * points at.
 */
export async function sendInvitationEmails(
  eventId: string,
  guestIds: string[],
  origin: string,
  side: GuestSide | null = null,
): Promise<{ sent: number; skipped: number; failed: number }> {
  if (!emailConfigured()) throw new Error("Праќањето email не е вклучено.");
  const client = createServiceRoleClient();

  const { data: invitation, error: invitationError } = await client
    .from("event_invitations")
    .select("public_slug")
    .eq("event_id", eventId)
    .maybeSingle();
  if (invitationError) throw invitationError;
  if (!invitation) throw new Error("Прво направете покана.");

  const { data: event, error: eventError } = await client
    .from("events")
    .select("couple_names, event_date, event_type, contact_email, venues(name)")
    .eq("id", eventId)
    .single();
  if (eventError) throw eventError;
  const venueName = (event.venues as unknown as { name: string } | null)?.name ?? "";

  let guestQuery = client.from("event_guests").select("id, full_name, email, invite_token").eq("event_id", eventId).in("id", guestIds);
  if (side) guestQuery = guestQuery.eq("side", side);
  const { data: guests, error } = await guestQuery;
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  const sentIds: string[] = [];
  const withEmail = guests.filter((g) => g.email);
  for (const guest of withEmail) {
    const text = inviteMessage({
      guestName: guest.full_name,
      coupleNames: event.couple_names,
      eventDate: event.event_date,
      venueName,
      eventType: event.event_type,
      link: personalInviteUrl(origin, invitation.public_slug, guest.invite_token),
    });
    try {
      await sendEmail({ to: guest.email!, subject: `Покана: ${event.couple_names}`, text, replyTo: event.contact_email ?? undefined });
      sent++;
      sentIds.push(guest.id);
    } catch (err) {
      failed++;
      // No address or link in the log: the token is the guest's credential.
      log("error", "invitation_email_failed", { event_id: eventId, guest_id: guest.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  await markInvitationSent(eventId, sentIds, "email");
  return { sent, skipped: guests.length - withEmail.length, failed };
}
