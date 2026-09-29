// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { upsertInvitation } from "@/lib/couple/invitations";
import { getReminder, runDueReminders, setReminder } from "@/lib/couple/reminders";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let venueId: string;

beforeAll(async () => {
  const { data } = await admin.from("venues").insert({ name: "Reminders Venue" }).select("id").single();
  venueId = data!.id;
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

function mockResend() {
  const sent: { to: string[]; subject: string; text: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).startsWith("https://api.resend.com/")) {
      sent.push(JSON.parse(String(init!.body)));
      return new Response("{}", { status: 200 });
    }
    return realFetch(input, init);
  });
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Каде Сум <noreply@example.mk>";
  return sent;
}

async function newEvent(eventDate: string, couple = "Ана и Марко") {
  const { data } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: couple, event_date: eventDate, created_at: "2027-01-01T00:00:00Z" })
    .select("id")
    .single();
  return data!.id as string;
}

describe("getReminder / setReminder (A10)", () => {
  it("shows the default time until the couple moves it", async () => {
    const id = await newEvent("2027-07-20");
    expect(await getReminder(id)).toEqual({ sendAt: "2027-07-05T08:00:00.000Z", status: "scheduled", isDefault: true, sentAt: null, sentCount: 0 });

    await setReminder(id, { sendAt: "2027-07-10T16:30:00.000Z", enabled: true }, new Date("2027-06-01T00:00:00Z"));
    expect(await getReminder(id)).toMatchObject({ sendAt: "2027-07-10T16:30:00.000Z", status: "scheduled", isDefault: false });

    await setReminder(id, { sendAt: "2027-07-10T16:30:00.000Z", enabled: false }, new Date("2027-06-01T00:00:00Z"));
    expect(await getReminder(id)).toMatchObject({ status: "cancelled" });
  });

  it("refuses a time in the past, after the event has begun, or once sent", async () => {
    const id = await newEvent("2027-07-20");
    const now = new Date("2027-06-01T00:00:00Z");
    await expect(setReminder(id, { sendAt: "2027-05-01T08:00:00Z", enabled: true }, now)).rejects.toThrow("Изберете време во иднина.");
    await expect(setReminder(id, { sendAt: "2027-07-20T08:00:00Z", enabled: true }, now)).rejects.toThrow("Потсетникот мора да е пред денот на настанот.");
    await admin.from("event_reminders").insert({ event_id: id, send_at: "2027-07-05T08:00:00Z", status: "sent" });
    await expect(setReminder(id, { sendAt: "2027-07-10T08:00:00Z", enabled: true }, now)).rejects.toThrow("Потсетникот е веќе испратен.");
  });
});

// Far-off years: the cron handles every due event in the (shared) test
// database, so these dates keep it to this file's events.
describe("runDueReminders (A10)", () => {
  it("emails confirmed and 'later' guests once, with their personal link, and marks the reminder sent", async () => {
    const sent = mockResend();
    const id = await newEvent("2091-09-20");
    const { public_slug } = await upsertInvitation(id, { template_id: "elegant-gold", message: null });
    const { data: guests } = await admin
      .from("event_guests")
      .insert([
        { event_id: id, full_name: "Да", email: "yes@example.mk", rsvp_status: "confirmed" },
        { event_id: id, full_name: "Подоцна", email: "later@example.mk", rsvp_status: "later" },
        { event_id: id, full_name: "Не", email: "no@example.mk", rsvp_status: "declined" },
        { event_id: id, full_name: "Без Email", rsvp_status: "confirmed" },
      ])
      .select("id, full_name, invite_token");
    const token = guests!.find((g) => g.full_name === "Да")!.invite_token;

    const first = await runDueReminders(new Date("2091-09-05T08:00:00Z"), "https://kadesum.mk");
    expect(first.find((r) => r.eventId === id)).toEqual({ eventId: id, sent: 2, failed: 0 });
    const mine = sent.filter((m) => ["yes@example.mk", "later@example.mk"].includes(m.to[0]));
    expect(mine.map((m) => m.to[0]).sort()).toEqual(["later@example.mk", "yes@example.mk"]);
    expect(sent.some((m) => m.to[0] === "no@example.mk")).toBe(false);
    const yes = mine.find((m) => m.to[0] === "yes@example.mk")!;
    expect(yes.subject).toBe("Потсетник: Ана и Марко");
    expect(yes.text).toContain(`https://kadesum.mk/invite/${public_slug}?g=${token}`);
    expect(await getReminder(id)).toMatchObject({ status: "sent", sentCount: 2 });

    // A second run (cron every hour) sends nothing more.
    const count = sent.length;
    await runDueReminders(new Date("2091-09-05T09:00:00Z"), "https://kadesum.mk");
    expect(sent.length).toBe(count);
  });

  it("skips a guest already reminded by a run that died half way", async () => {
    const sent = mockResend();
    const id = await newEvent("2092-10-20");
    await admin.from("event_guests").insert([
      { event_id: id, full_name: "Веќе", email: "done@example.mk", rsvp_status: "confirmed", reminder_sent_at: "2092-10-05T08:00:00Z" },
      { event_id: id, full_name: "Уште", email: "todo@example.mk", rsvp_status: "confirmed" },
    ]);
    await admin.from("event_reminders").insert({ event_id: id, send_at: "2092-10-05T08:00:00Z", status: "sending", updated_at: "2092-10-05T08:00:00Z" });

    const result = await runDueReminders(new Date("2092-10-05T09:00:00Z"), "https://kadesum.mk");
    expect(result.find((r) => r.eventId === id)).toEqual({ eventId: id, sent: 1, failed: 0 });
    expect(sent.filter((m) => ["done@example.mk", "todo@example.mk"].includes(m.to[0])).map((m) => m.to[0])).toEqual(["todo@example.mk"]);
  });

  it("does nothing, and claims nothing, when email is not set up", async () => {
    const id = await newEvent("2093-11-20");
    await admin.from("event_guests").insert({ event_id: id, full_name: "Да", email: "yes@example.mk", rsvp_status: "confirmed" });
    expect(await runDueReminders(new Date("2093-11-05T08:00:00Z"), "https://kadesum.mk")).toEqual([]);
    expect(await getReminder(id)).toMatchObject({ status: "scheduled", isDefault: true });
  });
});
