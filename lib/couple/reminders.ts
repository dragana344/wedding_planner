import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { emailConfigured, sendEmail } from "@/lib/email";
import { log } from "@/lib/log";
import { personalInviteUrl, reminderMessage } from "@/lib/couple/invite-share";
import { eventHasFeature } from "@/lib/entitlements/server";

// A10: one reminder email per event to guests who said yes or "later".
// Default: 15 days before at 10:00 Skopje (0062 default_reminder_at); the
// couple can move it or switch it off. Sent by /api/cron/reminders.

export type ReminderStatus = "scheduled" | "sending" | "sent" | "cancelled";

export interface Reminder {
  sendAt: string;
  status: ReminderStatus;
  /** No row yet: the default time applies. */
  isDefault: boolean;
  sentAt: string | null;
  sentCount: number;
}

const REMIND_STATUSES = ["confirmed", "later"];

export async function getReminder(eventId: string): Promise<Reminder> {
  const client = createServiceRoleClient();
  const { data: row, error } = await client
    .from("event_reminders")
    .select("send_at, status, sent_at, sent_count")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (row) {
    return {
      sendAt: new Date(row.send_at).toISOString(),
      status: row.status as ReminderStatus,
      isDefault: false,
      sentAt: row.sent_at,
      sentCount: row.sent_count,
    };
  }
  const { data: event, error: eventError } = await client.from("events").select("event_date").eq("id", eventId).single();
  if (eventError) throw eventError;
  const { data: sendAt, error: defaultError } = await client.rpc("default_reminder_at", { p_event_date: event.event_date });
  if (defaultError) throw defaultError;
  return { sendAt: new Date(sendAt as string).toISOString(), status: "scheduled", isDefault: true, sentAt: null, sentCount: 0 };
}

/** The couple moves the reminder or switches it off/on. */
export async function setReminder(eventId: string, input: { sendAt: string; enabled: boolean }, now: Date = new Date()): Promise<Reminder> {
  const current = await getReminder(eventId);
  if (current.status === "sent" || current.status === "sending") throw new Error("Потсетникот е веќе испратен.");

  const sendAt = new Date(input.sendAt);
  if (Number.isNaN(sendAt.getTime()) || sendAt <= now) throw new Error("Изберете време во иднина.");
  const client = createServiceRoleClient();
  const { data: event, error: eventError } = await client.from("events").select("event_date").eq("id", eventId).single();
  if (eventError) throw eventError;
  const { data: dayStart, error: dayError } = await client.rpc("default_reminder_at", { p_event_date: event.event_date });
  if (dayError) throw dayError;
  // default_reminder_at(d) is d-15 at 10:00; the event day starts 15 days and 10 hours later.
  const eventDayStart = new Date(new Date(dayStart as string).getTime() + (15 * 24 - 10) * 3600_000);
  if (sendAt >= eventDayStart) throw new Error("Потсетникот мора да е пред денот на настанот.");

  const { error } = await client.from("event_reminders").upsert({
    event_id: eventId,
    send_at: sendAt.toISOString(),
    status: input.enabled ? "scheduled" : "cancelled",
    updated_at: now.toISOString(),
  });
  if (error) throw error;
  return getReminder(eventId);
}

/**
 * Sends every reminder due at `now`. Each event is claimed first (only one
 * cron run sends it); each guest is stamped as they are emailed, so a run
 * that dies half way never emails anyone twice. Without email configured it
 * does nothing, so reminders go out once it is. An event whose package lacks
 * `reminders` is skipped without being claimed or marked sent, so it goes
 * out on a later run if the feature is switched on in time.
 */
export async function runDueReminders(now: Date, origin: string): Promise<{ eventId: string; sent: number; failed: number }[]> {
  if (!emailConfigured()) return [];
  const client = createServiceRoleClient();
  const { data: due, error } = await client.rpc("due_event_reminders", { p_now: now.toISOString() });
  if (error) throw error;

  const results: { eventId: string; sent: number; failed: number }[] = [];
  for (const { event_id: eventId } of due as { event_id: string }[]) {
    if (!(await eventHasFeature(eventId, "reminders"))) continue;
    const { data: claimed, error: claimError } = await client.rpc("claim_event_reminder", { p_event_id: eventId, p_now: now.toISOString() });
    if (claimError) throw claimError;
    if (!claimed) continue;
    results.push({ eventId, ...(await sendEventReminder(eventId, now, origin)) });
  }
  return results;
}

async function sendEventReminder(eventId: string, now: Date, origin: string): Promise<{ sent: number; failed: number }> {
  const client = createServiceRoleClient();
  const { data: event, error: eventError } = await client
    .from("events")
    .select("couple_names, event_date, event_type, contact_email, venues(name), event_invitations(public_slug)")
    .eq("id", eventId)
    .single();
  if (eventError) throw eventError;
  const venueName = (event.venues as unknown as { name: string } | null)?.name ?? "";
  const invitation = event.event_invitations as unknown as { public_slug: string } | { public_slug: string }[] | null;
  const slug = Array.isArray(invitation) ? invitation[0]?.public_slug : invitation?.public_slug;

  const { data: guests, error } = await client
    .from("event_guests")
    .select("id, full_name, email, invite_token")
    .eq("event_id", eventId)
    .in("rsvp_status", REMIND_STATUSES)
    .not("email", "is", null)
    .is("reminder_sent_at", null);
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  for (const guest of guests) {
    const text = reminderMessage({
      guestName: guest.full_name,
      coupleNames: event.couple_names,
      eventDate: event.event_date,
      venueName,
      eventType: event.event_type,
      link: slug ? personalInviteUrl(origin, slug, guest.invite_token) : origin,
    });
    try {
      await sendEmail({ to: guest.email!, subject: `Потсетник: ${event.couple_names}`, text, replyTo: event.contact_email ?? undefined });
      await client.from("event_guests").update({ reminder_sent_at: now.toISOString() }).eq("id", guest.id);
      sent++;
    } catch (err) {
      failed++;
      log("error", "reminder_email_failed", { event_id: eventId, guest_id: guest.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const { data: row } = await client.from("event_reminders").select("sent_count").eq("event_id", eventId).single();
  const { error: doneError } = await client
    .from("event_reminders")
    .update({ status: "sent", sent_at: now.toISOString(), sent_count: (row?.sent_count ?? 0) + sent, updated_at: now.toISOString() })
    .eq("event_id", eventId);
  if (doneError) throw doneError;
  return { sent, failed };
}
