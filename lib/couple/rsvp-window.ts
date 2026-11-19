import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { todayIn } from "@/lib/date";
import {
  DEFAULT_RSVP_DEADLINE_DAYS,
  RSVP_DEADLINE_PASSED_ERROR,
  RSVP_EVENT_CANCELLED_MESSAGE,
  effectiveRsvpDeadline,
  invitationPhase,
  type InvitationPhase,
} from "@/lib/rsvp-deadline";

// When guests can answer (group B task 2, 0180), read from the database:
// the venue's deadline, the event's state, and whether the event's date
// was moved after guests had answered. The guest form, the RSVP route and
// the couple's pages all ask here, so they always agree.

export interface RsvpWindow {
  eventId: string;
  eventDate: string;
  /** The effective deadline, "YYYY-MM-DD" (the day itself is still open). */
  deadline: string;
  /** The event's own date, when the venue set one (null: the venue's default). */
  deadlineOverride: string | null;
  /** The venue's "N days before" default. */
  defaultDays: number;
  phase: InvitationPhase;
}

type EventRow = {
  id: string;
  event_date: string;
  status: string;
  rsvp_deadline: string | null;
  venues: { rsvp_deadline_days: number } | { rsvp_deadline_days: number }[] | null;
};

function toWindow(event: EventRow, now: Date): RsvpWindow {
  const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues;
  const defaultDays = venue?.rsvp_deadline_days ?? DEFAULT_RSVP_DEADLINE_DAYS;
  const deadline = effectiveRsvpDeadline(event.event_date, event.rsvp_deadline, defaultDays);
  return {
    eventId: event.id,
    eventDate: event.event_date,
    deadline,
    deadlineOverride: event.rsvp_deadline,
    defaultDays,
    phase: invitationPhase({ eventDate: event.event_date, deadline, status: event.status, today: todayIn(undefined, now) }),
  };
}

const WINDOW_COLUMNS = "id, event_date, status, rsvp_deadline, venues(rsvp_deadline_days)";

export async function getRsvpWindow(eventId: string, now: Date = new Date()): Promise<RsvpWindow> {
  const { data, error } = await createServiceRoleClient().from("events").select(WINDOW_COLUMNS).eq("id", eventId).single();
  if (error) throw error;
  return toWindow(data as unknown as EventRow, now);
}

/**
 * Refuses a guest's own answer outside the window, with the message the
 * guest sees. The couple's own entries (source 'couple') never come here:
 * they may record answers after the deadline.
 */
export async function assertGuestCanAnswer(eventId: string, now: Date = new Date()): Promise<void> {
  const { phase } = await getRsvpWindow(eventId, now);
  if (phase === "cancelled") throw new Error(RSVP_EVENT_CANCELLED_MESSAGE);
  if (phase !== "open") throw new Error(RSVP_DEADLINE_PASSED_ERROR);
}

/** The event's latest real date move (the time may change too; only a new day counts). */
export async function latestDateChange(eventId: string): Promise<{ date: string; changedAt: string } | null> {
  const { data, error } = await createServiceRoleClient()
    .from("event_changes")
    .select("old_value, new_value, changed_at")
    .eq("event_id", eventId)
    .eq("section", "date_time")
    .order("changed_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  for (const row of data ?? []) {
    const before = (row.old_value as { date?: string } | null)?.date ?? null;
    const after = (row.new_value as { date?: string } | null)?.date ?? null;
    if (after && before !== after) return { date: after, changedAt: row.changed_at };
  }
  return null;
}

/**
 * Decision 2/4: the date was moved after guests had answered. Null when it
 * never moved, or nobody had answered yet when it did (then the invitation
 * already shows the right date to everyone).
 */
export async function getPostponement(eventId: string): Promise<{ date: string; changedAt: string } | null> {
  const change = await latestDateChange(eventId);
  if (!change) return null;
  const client = createServiceRoleClient();
  const [answers, linkChanges] = await Promise.all([
    client
      .from("event_rsvp_answers")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .neq("source", "couple")
      .lt("created_at", change.changedAt),
    // Answers from before 0179 left only this mark on the guest.
    client
      .from("event_guests")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .lt("rsvp_changed_via_link_at", change.changedAt),
  ]);
  if (answers.error) throw answers.error;
  if (linkChanges.error) throw linkChanges.error;
  return (answers.count ?? 0) + (linkChanges.count ?? 0) > 0 ? change : null;
}

/** What the invitation page needs about answering, for one invitation link. */
export interface InvitationRsvpState {
  phase: InvitationPhase;
  deadline: string;
  /** The new date, when it moved after guests had answered and the form is still open. */
  postponedTo: string | null;
  /** When the date moved (to compare with a personal guest's last answer). */
  postponedAt: string | null;
}

export async function getInvitationRsvpState(slug: string, now: Date = new Date()): Promise<InvitationRsvpState | null> {
  const client = createServiceRoleClient();
  const { data: invitation, error } = await client.from("event_invitations").select("event_id").eq("public_slug", slug).maybeSingle();
  if (error) throw error;
  if (!invitation) return null;
  const window = await getRsvpWindow(invitation.event_id as string, now);
  // A moved date only matters while guests can still answer.
  const postponed = window.phase === "open" ? await getPostponement(window.eventId) : null;
  return { phase: window.phase, deadline: window.deadline, postponedTo: postponed?.date ?? null, postponedAt: postponed?.changedAt ?? null };
}

