// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { upsertInvitation } from "@/lib/couple/invitations";
import { markInvitationSent, sendInvitationEmails } from "@/lib/couple/invitation-sending";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let venueId: string;
let eventId: string;
let otherEventId: string;
let slug: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Sending Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "Ана и Марко", event_date: "2027-06-12", contact_email: "couple@example.mk" })
    .select("id")
    .single();
  eventId = event!.id;
  const { data: other } = await admin.from("events").insert({ venue_id: venueId, couple_names: "Други", event_date: "2027-06-13" }).select("id").single();
  otherEventId = other!.id;
  slug = (await upsertInvitation(eventId, { template_id: "elegant-gold", message: null })).public_slug;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

const realFetch = globalThis.fetch;
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

/** Captures Resend calls; everything else (Supabase) goes through. */
function mockResend(status = 200) {
  const sent: { to: string[]; subject: string; text: string; reply_to?: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).startsWith("https://api.resend.com/")) {
      sent.push(JSON.parse(String(init!.body)));
      return new Response("{}", { status });
    }
    return realFetch(input, init);
  });
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Каде Сум <noreply@example.mk>";
  return sent;
}

async function addGuest(event: string, fields: Record<string, unknown> = {}) {
  const { data } = await admin
    .from("event_guests")
    .insert({ event_id: event, full_name: "Петар Петровски", ...fields })
    .select("id, invite_token")
    .single();
  return data!;
}

describe("markInvitationSent (A8, A9)", () => {
  it("records when and how the couple sent the invitation, only for this event's guests", async () => {
    const mine = await addGuest(eventId);
    const theirs = await addGuest(otherEventId);

    const updated = await markInvitationSent(eventId, [mine.id, theirs.id], "whatsapp");

    expect(updated.map((g) => g.id)).toEqual([mine.id]);
    expect(updated[0].invitation_channel).toBe("whatsapp");
    expect(updated[0].invitation_sent_at).not.toBeNull();
    const { data: other } = await admin.from("event_guests").select("invitation_sent_at").eq("id", theirs.id).single();
    expect(other!.invitation_sent_at).toBeNull();
  });
});

describe("co-organizers send for their own side only (A12)", () => {
  it("marks and emails only guests on the co-organizer's side", async () => {
    const sent = mockResend();
    const bride = await addGuest(eventId, { full_name: "Невестина", side: "bride", email: "b@example.mk" });
    const groom = await addGuest(eventId, { full_name: "Младоженецова", side: "groom", email: "g@example.mk" });

    expect((await markInvitationSent(eventId, [bride.id, groom.id], "sms", "groom")).map((g) => g.id)).toEqual([groom.id]);
    expect(await sendInvitationEmails(eventId, [bride.id, groom.id], "https://kadesum.mk", "bride")).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(sent.map((m) => m.to[0])).toEqual(["b@example.mk"]);
  });
});

describe("sendInvitationEmails (A9)", () => {
  it("emails each guest their personal link and marks them sent; guests without email are skipped", async () => {
    const sent = mockResend();
    const withEmail = await addGuest(eventId, { full_name: "Јана Илиева", email: "jana@example.mk" });
    const without = await addGuest(eventId, { full_name: "Баба Вера" });

    const result = await sendInvitationEmails(eventId, [withEmail.id, without.id], "https://kadesum.mk");

    expect(result).toEqual({ sent: 1, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["jana@example.mk"]);
    expect(sent[0].subject).toBe("Покана: Ана и Марко");
    expect(sent[0].text).toContain("Почитуван/а Јана Илиева");
    expect(sent[0].text).toContain(`https://kadesum.mk/invite/${slug}?g=${withEmail.invite_token}`);
    expect(sent[0].reply_to).toBe("couple@example.mk");

    const { data: rows } = await admin.from("event_guests").select("id, invitation_channel").in("id", [withEmail.id, without.id]);
    expect(Object.fromEntries(rows!.map((r) => [r.id, r.invitation_channel]))).toEqual({ [withEmail.id]: "email", [without.id]: null });
  });

  it("counts a Resend failure and does not mark that guest sent", async () => {
    mockResend(500);
    const guest = await addGuest(eventId, { email: "fail@example.mk" });
    expect(await sendInvitationEmails(eventId, [guest.id], "https://kadesum.mk")).toEqual({ sent: 0, skipped: 0, failed: 1 });
    const { data } = await admin.from("event_guests").select("invitation_sent_at").eq("id", guest.id).single();
    expect(data!.invitation_sent_at).toBeNull();
  });

  it("refuses when email is not set up or there is no invitation yet", async () => {
    const guest = await addGuest(eventId, { email: "x@example.mk" });
    await expect(sendInvitationEmails(eventId, [guest.id], "https://kadesum.mk")).rejects.toThrow("Праќањето email не е вклучено.");

    mockResend();
    const otherGuest = await addGuest(otherEventId, { email: "y@example.mk" });
    await expect(sendInvitationEmails(otherEventId, [otherGuest.id], "https://kadesum.mk")).rejects.toThrow("Прво направете покана.");
  });
});
