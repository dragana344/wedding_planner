// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upsertInvitation } from "@/lib/couple/invitations";
import { getInviteeByToken, submitRsvpBySlug } from "@/lib/couple/rsvp";
import { recordCoupleAnswer, resolveAnswer } from "@/lib/couple/rsvp-answers";
import { getInvitationRsvpState, getPostponement, getRsvpWindow } from "@/lib/couple/rsvp-window";
import { getEventSummary } from "@/lib/couple/dashboard";
import { readAnswerGreetingTicket, sendInvitationGreeting } from "@/lib/couple/invite-greetings";
import { listGreetings } from "@/lib/media/greetings";
import { updateEvent, type UpdateEventInput } from "@/lib/venue/events";
import { POST as rsvpRoute } from "@/app/api/invite/[slug]/rsvp/route";
import { todayIn } from "@/lib/date";
import { minusDays, needsReconfirm, RSVP_DEADLINE_AFTER_EVENT_ERROR, RSVP_DEADLINE_PASSED_ERROR, RSVP_EVENT_CANCELLED_MESSAGE } from "@/lib/rsvp-deadline";

// Group B task 2 (0180): the venue's answer deadline, the invitation's
// states (closed, after the event, cancelled, a moved date), and greetings
// sent with an answer that waits for the couple.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const venues: string[] = [];

afterAll(async () => {
  if (venues.length) await admin.from("venues").delete().in("id", venues);
});

/** today ± days, in the venue's calendar. */
const day = (offset: number) => minusDays(todayIn(), -offset);

async function setup(name: string, eventDate: string, venueFields: Record<string, unknown> = {}, eventFields: Record<string, unknown> = {}) {
  const { data: venue } = await admin.from("venues").insert({ name: `Deadline ${name} ${Date.now()}`, ...venueFields }).select("id").single();
  venues.push(venue!.id);
  const { data: event, error } = await admin
    .from("events")
    .insert({ venue_id: venue!.id, couple_names: name, event_date: eventDate, ...eventFields })
    .select("id")
    .single();
  if (error) throw error;
  const invitation = await upsertInvitation(event!.id, { template_id: "romantic-floral", message: null });
  return { venueId: venue!.id as string, eventId: event!.id as string, slug: invitation.public_slug };
}

async function guest(eventId: string, fields: Record<string, unknown>) {
  const { data, error } = await admin.from("event_guests").insert({ event_id: eventId, rsvp_status: "invited", ...fields }).select("id, invite_token").single();
  if (error) throw error;
  return data!;
}

function post(slug: string, body: unknown) {
  return rsvpRoute(
    new NextRequest(`http://localhost/api/invite/${slug}/rsvp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `deadline-${Math.random()}` },
      body: JSON.stringify(body),
    }),
    { params: { slug } },
  );
}

describe("the venue's answer deadline", () => {
  it("defaults to 15 days before; the deadline day itself is still open", async () => {
    const { eventId, slug } = await setup("Open Day", day(15));
    const window = await getRsvpWindow(eventId);
    expect(window).toMatchObject({ deadline: todayIn(), deadlineOverride: null, defaultDays: 15, phase: "open" });
    await expect(submitRsvpBySlug(slug, { fullName: "Ана", status: "confirmed", partySize: 1 })).resolves.toMatchObject({ eventId });
  });

  it("closes the shared and the personal link after it, on the server; the couple can still record answers", async () => {
    const { eventId, slug } = await setup("Closed", day(14));
    const g = await guest(eventId, { full_name: "Марко" });
    expect((await getRsvpWindow(eventId)).phase).toBe("closed");

    const shared = await post(slug, { full_name: "Ана", status: "confirmed", party_size: 1 });
    expect(shared.status).toBe(400);
    expect(await shared.json()).toEqual({ error: RSVP_DEADLINE_PASSED_ERROR });
    const personal = await post(slug, { guest_token: g.invite_token, status: "declined" });
    expect(personal.status).toBe(400);
    expect(await personal.json()).toEqual({ error: RSVP_DEADLINE_PASSED_ERROR });
    // Nothing was stored or created.
    expect((await admin.from("event_rsvp_answers").select("id").eq("event_id", eventId)).data).toEqual([]);
    expect((await admin.from("event_guests").select("id").eq("event_id", eventId)).data).toHaveLength(1);

    const recorded = await recordCoupleAnswer(eventId, g.id, { status: "confirmed", partySize: 2 }, "couple");
    expect(recorded).toMatchObject({ rsvp_status: "confirmed", party_size: 2 });
  });

  it("uses the venue's own number of days", async () => {
    const { eventId } = await setup("Venue Days", day(14), { rsvp_deadline_days: 10 });
    expect(await getRsvpWindow(eventId)).toMatchObject({ deadline: day(4), defaultDays: 10, phase: "open" });
  });

  it("an event's own date replaces the venue's default, both ways", async () => {
    const later = await setup("Override Later", day(5), {}, { rsvp_deadline: day(2) });
    expect(await getRsvpWindow(later.eventId)).toMatchObject({ deadline: day(2), deadlineOverride: day(2), phase: "open" });
    const earlier = await setup("Override Earlier", day(60), {}, { rsvp_deadline: day(-1) });
    expect((await getRsvpWindow(earlier.eventId)).phase).toBe("closed");
    await expect(submitRsvpBySlug(earlier.slug, { fullName: "Ана", status: "declined", partySize: 1 })).rejects.toThrow(RSVP_DEADLINE_PASSED_ERROR);
  });

  it("after the event: a thank-you state, and answers are refused", async () => {
    const { eventId, slug } = await setup("After", day(-1));
    expect((await getInvitationRsvpState(slug))!.phase).toBe("after");
    await expect(submitRsvpBySlug(slug, { fullName: "Ана", status: "confirmed", partySize: 1 })).rejects.toThrow(RSVP_DEADLINE_PASSED_ERROR);
    expect((await getRsvpWindow(eventId)).phase).toBe("after");
  });

  it("a cancelled event: no form, and the server says so", async () => {
    const { slug } = await setup("Cancelled", day(40), {}, { status: "cancelled" });
    expect((await getInvitationRsvpState(slug))!.phase).toBe("cancelled");
    const res = await post(slug, { full_name: "Ана", status: "confirmed", party_size: 1 });
    expect(await res.json()).toEqual({ error: RSVP_EVENT_CANCELLED_MESSAGE });
  });

  it("the couple's summary carries the effective deadline", async () => {
    const { eventId } = await setup("Summary", day(30), { rsvp_deadline_days: 7 });
    expect((await getEventSummary(eventId)).rsvp_deadline).toBe(day(23));
  });

  it("the venue sets an event's own date through the event form; after the event's date is refused; left out it is kept", async () => {
    const { venueId, eventId } = await setup("Edit", day(30));
    const base: UpdateEventInput = {
      couple_names: "Edit",
      event_date: day(30),
      start_time: null,
      end_time: null,
      status: "preparation",
      event_type: "wedding",
      guest_count_estimate: null,
      room_ids: [],
      added_menu_ids: [],
      removed_menu_ids: [],
      seating_self_edit_enabled: null,
    };
    await updateEvent(eventId, venueId, { ...base, rsvp_deadline: day(20) }, admin);
    expect((await getRsvpWindow(eventId)).deadline).toBe(day(20));
    await updateEvent(eventId, venueId, base, admin);
    expect((await getRsvpWindow(eventId)).deadlineOverride).toBe(day(20));
    await expect(updateEvent(eventId, venueId, { ...base, rsvp_deadline: day(31) }, admin)).rejects.toThrow(RSVP_DEADLINE_AFTER_EVENT_ERROR);
    await updateEvent(eventId, venueId, { ...base, rsvp_deadline: null }, admin);
    expect(await getRsvpWindow(eventId)).toMatchObject({ deadlineOverride: null, deadline: day(15) });
  });

  it("0184: moving the event later drops its own deadline when that falls before the new date's default; a deadline typed in the same save is kept", async () => {
    const { venueId, eventId } = await setup("Moved later", day(30));
    const base: UpdateEventInput = {
      couple_names: "Moved later", event_date: day(30), start_time: null, end_time: null, status: "preparation", event_type: "wedding",
      guest_count_estimate: null, room_ids: [], added_menu_ids: [], removed_menu_ids: [], seating_self_edit_enabled: null,
    };
    await updateEvent(eventId, venueId, { ...base, rsvp_deadline: day(20) }, admin);
    // Moved 10 days later: the default (15 days before) is day(25), after day(20) — back to the default.
    expect(await updateEvent(eventId, venueId, { ...base, event_date: day(40), rsvp_deadline: day(20) }, admin)).toEqual({ rsvpDeadlineReset: true });
    expect(await getRsvpWindow(eventId)).toMatchObject({ deadlineOverride: null, deadline: day(25) });

    // A new deadline typed with the move is the venue's choice; moving earlier never resets.
    expect(await updateEvent(eventId, venueId, { ...base, event_date: day(60), rsvp_deadline: day(45) }, admin)).toEqual({ rsvpDeadlineReset: false });
    expect(await updateEvent(eventId, venueId, { ...base, event_date: day(50), rsvp_deadline: day(45) }, admin)).toEqual({ rsvpDeadlineReset: false });
    expect((await getRsvpWindow(eventId)).deadlineOverride).toBe(day(45));
    // Later again, but the kept deadline is still after the new default (day(37)): kept.
    expect(await updateEvent(eventId, venueId, { ...base, event_date: day(52) }, admin)).toEqual({ rsvpDeadlineReset: false });
    expect((await getRsvpWindow(eventId)).deadlineOverride).toBe(day(45));
  });
});

describe("a moved date (0180)", () => {
  it("asks guests who said yes before the move to confirm again; a new answer clears it", async () => {
    const { eventId, slug } = await setup("Moved", day(60));
    const yes = await guest(eventId, { full_name: "Ана" });
    const no = await guest(eventId, { full_name: "Марко" });
    await submitRsvpBySlug(slug, { guestToken: yes.invite_token, status: "confirmed", partySize: 2 });
    await submitRsvpBySlug(slug, { guestToken: no.invite_token, status: "declined", partySize: 1 });
    expect(await getPostponement(eventId)).toBeNull();

    // A time-only change is not a move.
    await admin.from("events").update({ start_time: "18:00" }).eq("id", eventId);
    expect(await getPostponement(eventId)).toBeNull();

    await admin.from("events").update({ event_date: day(80) }).eq("id", eventId);
    const state = (await getInvitationRsvpState(slug))!;
    expect(state).toMatchObject({ phase: "open", postponedTo: day(80) });
    const ana = (await getInviteeByToken(slug, yes.invite_token))!;
    expect(needsReconfirm(ana.rsvpStatus, ana.answeredAt ?? null, state.postponedAt)).toBe(true);
    const marko = (await getInviteeByToken(slug, no.invite_token))!;
    expect(needsReconfirm(marko.rsvpStatus, marko.answeredAt ?? null, state.postponedAt)).toBe(false);

    // The reconfirm button sends the same answer again: a new row, the answer stays.
    await submitRsvpBySlug(slug, { guestToken: yes.invite_token, status: "confirmed", partySize: 2 });
    const again = (await getInviteeByToken(slug, yes.invite_token))!;
    expect(again).toMatchObject({ rsvpStatus: "confirmed", partySize: 2 });
    expect(needsReconfirm(again.rsvpStatus, again.answeredAt ?? null, state.postponedAt)).toBe(false);
    expect((await admin.from("event_rsvp_answers").select("id").eq("guest_id", yes.id)).data).toHaveLength(2);
  });

  it("a move before anybody answered shows nothing", async () => {
    const { eventId, slug } = await setup("Moved Early", day(60));
    await admin.from("events").update({ event_date: day(70) }).eq("id", eventId);
    expect((await getInvitationRsvpState(slug))!.postponedTo).toBeNull();
  });
});

describe("greetings sent with an answer that waits for the couple (0180)", () => {
  async function pendingWithGreeting(name: string, message: string) {
    const { eventId, slug } = await setup(name, day(60));
    const a = await guest(eventId, { full_name: "Ана Петровска" });
    await guest(eventId, { full_name: "Ана Петровска" });
    const res = await post(slug, { full_name: "Ана Петровска", status: "confirmed", party_size: 1 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { greeting?: { ticket: string; sent: boolean }; remember?: string };
    expect(body.remember).toBeUndefined();
    expect(body.greeting!.sent).toBe(false);
    const answerId = readAnswerGreetingTicket(eventId, body.greeting!.ticket)!;
    expect(answerId).toMatch(/^[0-9a-f-]{36}$/);
    const sent = await sendInvitationGreeting(slug, { ticket: body.greeting!.ticket }, { message });
    return { eventId, slug, a, answerId, ticket: body.greeting!.ticket, greetingId: sent.id };
  }

  async function greetingRow(id: string) {
    return (await admin.from("event_greetings").select("guest_id, rsvp_answer_id, first_name, last_name").eq("id", id).single()).data!;
  }

  it("is stored with the answer, one per answer, and moves to the guest the couple picks", async () => {
    const { eventId, slug, a, answerId, ticket, greetingId } = await pendingWithGreeting("Greet Pending", "Честито!");
    expect(await greetingRow(greetingId)).toEqual({ guest_id: null, rsvp_answer_id: answerId, first_name: "Ана", last_name: "Петровска" });
    // Visible in Честитки right away.
    expect((await listGreetings(eventId)).map((g) => g.id)).toContain(greetingId);
    await expect(sendInvitationGreeting(slug, { ticket }, { message: "Уште една" })).rejects.toThrow("Веќе испративте честитка");

    await resolveAnswer(eventId, answerId, { kind: "guest", guestId: a.id }, "couple");
    expect((await greetingRow(greetingId)).guest_id).toBe(a.id);
  });

  it("if the guest already sent one, both are kept and the newer stays unattached", async () => {
    const { eventId, slug, a, answerId, greetingId } = await pendingWithGreeting("Greet Twice", "Од одговорот");
    const own = await sendInvitationGreeting(slug, { guestToken: a.invite_token }, { message: "Мојата" });
    await resolveAnswer(eventId, answerId, { kind: "guest", guestId: a.id }, "couple");
    expect((await greetingRow(own.id)).guest_id).toBe(a.id);
    expect(await greetingRow(greetingId)).toMatchObject({ guest_id: null, rsvp_answer_id: answerId });
    expect((await listGreetings(eventId)).map((g) => g.id).sort()).toEqual([own.id, greetingId].sort());
  });

  it("a new guest gets it; an ignored answer keeps it unattached but visible", async () => {
    const created = await pendingWithGreeting("Greet New", "Ново");
    const guest = await resolveAnswer(created.eventId, created.answerId, { kind: "new" }, "couple");
    expect((await greetingRow(created.greetingId)).guest_id).toBe(guest!.id);

    const ignored = await pendingWithGreeting("Greet Ignore", "Игнорирано");
    await resolveAnswer(ignored.eventId, ignored.answerId, { kind: "ignore" }, "couple");
    expect((await greetingRow(ignored.greetingId)).guest_id).toBeNull();
    expect((await listGreetings(ignored.eventId)).map((g) => g.id)).toContain(ignored.greetingId);
  });

  it("deleting a guest whose greeting has a one-word name no longer fails (0151 check)", async () => {
    const { eventId, slug } = await setup("One Word", day(60));
    const g = await guest(eventId, { full_name: "Мила" });
    await sendInvitationGreeting(slug, { guestToken: g.invite_token }, { message: "Здраво" });
    const { error } = await admin.from("event_guests").delete().eq("id", g.id);
    expect(error).toBeNull();
    expect((await admin.from("event_greetings").select("guest_id, last_name").eq("event_id", eventId)).data).toEqual([{ guest_id: null, last_name: "" }]);
  });
});
