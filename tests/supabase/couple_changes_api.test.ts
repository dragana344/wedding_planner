// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GET } from "@/app/api/couple/changes/route";
import { POST as seenRoute } from "@/app/api/couple/changes/seen/route";
import { listGuestReplies } from "@/lib/couple/guest-replies";
import { listCoupleNotifications } from "@/lib/couple/notifications";
import { getSeen } from "@/lib/changes/server";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let venueId: string;

const DAY = 86_400_000;
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function newEvent(name: string, opts: { daysAhead?: number; firstLogin?: string | null; createdDaysAgo?: number } = {}): Promise<string> {
  const { data, error } = await admin
    .from("events")
    .insert({
      venue_id: venueId,
      couple_names: name,
      event_date: isoDate(opts.daysAhead ?? 200),
      couple_first_login_at: opts.firstLogin === undefined ? ago(10 * DAY) : opts.firstLogin,
      // Created well before the 25-day reminder unless a test says otherwise.
      created_at: ago((opts.createdDaysAgo ?? 60) * DAY),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function change(eventId: string, section: string, side: "venue" | "couple", changedAt: string, newValue: unknown = { count: 50 }) {
  const { data, error } = await admin
    .from("event_changes")
    .insert({ event_id: eventId, section, side, changed_by: side === "venue" ? "Салата" : "Младенците", field: "x", old_value: { count: 10 }, new_value: newValue, changed_at: changedAt })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

function req(method: string, eventId: string, body?: unknown, side?: string) {
  const headers: Record<string, string> = { "x-couple-event-id": eventId };
  if (side) headers["x-couple-organizer-side"] = side;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest("http://localhost/api/couple/changes", { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const getChanges = async (e: string) => (await GET(req("GET", e), { params: {} })).json();
const seen = (e: string, section: string, up_to: string, side?: string) => seenRoute(req("POST", e, { section, up_to }, side), { params: {} });

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `CoupleChanges ${Date.now()}` }).select("id").single()).data!.id;
}, 60_000);
afterAll(async () => {
  if (venueId) await admin.from("venues").delete().eq("id", venueId);
});

describe("GET /api/couple/changes", () => {
  it("shows venue changes after first login, not before, not the couple's own", async () => {
    const e = await newEvent("Прво најавување");
    await change(e, "rooms", "venue", ago(20 * DAY));
    const shown = await change(e, "date_time", "venue", ago(DAY));
    await change(e, "guest_count", "couple", ago(DAY));
    const body = await getChanges(e);
    expect(Object.keys(body.unseen)).toEqual(["date_time"]);
    expect(body.unseen.date_time[0].id).toBe(shown);
    expect(body.venueNumbersUnseen).toBeNull();
  });

  it("shows nothing when the couple never logged in", async () => {
    const e = await newEvent("Без најава", { firstLogin: null });
    await change(e, "rooms", "venue", ago(DAY));
    expect((await getChanges(e)).unseen).toEqual({});
  });

  it("Видено hides what was seen, and flags a change that arrived meanwhile", async () => {
    const e = await newEvent("Видено");
    const t1 = ago(3 * DAY);
    await change(e, "menus", "venue", t1);
    expect((await (await seen(e, "menus", t1)).json())).toEqual({ ok: true });
    expect(Object.keys((await getChanges(e)).unseen)).toEqual([]);
    const t2 = new Date().toISOString();
    await change(e, "menus", "venue", t2);
    // an older up_to never moves the position back
    const res = await (await seen(e, "menus", ago(5 * DAY))).json();
    expect(res).toEqual({ ok: true, newer: true });
    expect((await getSeen(e, "couple")).menus).toBe(new Date(t1).toISOString().replace("Z", "+00:00"));
    expect((await getChanges(e)).unseen.menus).toHaveLength(1);
  });

  it("menu numbers entered by the venue show until seen", async () => {
    const e = await newEvent("Бројки");
    const m = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "М" }).select("id").single()).data!.id;
    const sentAt = new Date().toISOString();
    await admin.from("event_menu_submissions").insert({ event_id: e, sent_by: "Салата", counts: { [m]: 5 }, menu_titles: { [m]: "М" }, total: 5, source: "venue", sent_at: sentAt });
    const body = await getChanges(e);
    expect(body.venueNumbersUnseen.source).toBe("venue");
    expect(await (await seen(e, "menu_numbers", sentAt)).json()).toEqual({ ok: true });
    expect((await getChanges(e)).venueNumbersUnseen).toBeNull();
  });
});

describe("POST /api/couple/changes/seen", () => {
  it("rejects bad input", async () => {
    const e = await newEvent("Лош влез");
    expect((await seen(e, "nope", new Date().toISOString())).status).toBe(400);
    expect((await seen(e, "rooms", "yesterday")).status).toBe(400);
  });

  it("a co-organizer can press Видено", async () => {
    const e = await newEvent("Ко-орг");
    expect((await seen(e, "rooms", new Date().toISOString(), "bride")).status).toBe(200);
    expect(Object.keys(await getSeen(e, "couple"))).toEqual(["rooms"]);
  });

  it("newer for guest replies compares against RSVP times", async () => {
    const e = await newEvent("Одговори newer");
    const upTo = ago(DAY);
    await admin.from("audit_log").insert({ actor_type: "guest", action: "public_rsvp", venue_id: venueId, event_id: e, details: { new_status: "confirmed" }, occurred_at: new Date().toISOString() });
    expect(await (await seen(e, "guest_replies", upTo)).json()).toEqual({ ok: true, newer: true });
  });
});

describe("guest replies and notifications", () => {
  it("lists replies with names, newest first, with unseen state", async () => {
    const e = await newEvent("Одговори");
    const g = (await admin.from("event_guests").insert({ event_id: e, full_name: "Ана Гостин" }).select("id").single()).data!.id;
    const t1 = ago(2 * DAY);
    const t2 = ago(DAY);
    await admin.from("audit_log").insert([
      { actor_type: "guest", action: "public_rsvp", venue_id: venueId, event_id: e, target_id: g, details: { previous_status: "invited", new_status: "confirmed" }, occurred_at: t1 },
      { actor_type: "guest", action: "public_rsvp", venue_id: venueId, event_id: e, target_id: g, details: { previous_status: "confirmed", new_status: "declined" }, occurred_at: t2 },
    ]);
    const replies = await listGuestReplies(e);
    expect(replies.map((r) => r.newStatus)).toEqual(["declined", "confirmed"]);
    expect(replies[0]).toMatchObject({ guestId: g, guestName: "Ана Гостин", previousStatus: "confirmed" });

    let notes = (await listCoupleNotifications(e)).filter((n) => n.kind === "guest_reply");
    expect(notes.map((n) => [n.title, n.detail, n.unseen])).toEqual([["Ана Гостин", "Одбиен", true], ["Ана Гостин", "Потврден", true]]);
    await seen(e, "guest_replies", t1);
    notes = (await listCoupleNotifications(e)).filter((n) => n.kind === "guest_reply");
    expect(notes.map((n) => n.unseen)).toEqual([true, false]);
    await seen(e, "guest_replies", t2);
    expect((await listCoupleNotifications(e)).every((n) => !n.unseen)).toBe(true);
  });

  it("venue changes: first-login rule, section title, contact values shown, unseen per Видено", async () => {
    const e = await newEvent("Известувања");
    await change(e, "rooms", "venue", ago(20 * DAY));
    const t = ago(DAY);
    await change(e, "contact", "venue", t, { phone: "070123456" });
    let notes = await listCoupleNotifications(e);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: "venue_change", section: "contact", title: "Контакт", unseen: true });
    expect(notes[0].id).toMatch(/^chg-/);
    expect(notes[0].detail).toContain("070123456");
    await seen(e, "contact", t);
    notes = await listCoupleNotifications(e);
    expect(notes[0].unseen).toBe(false);
    const never = await newEvent("Никогаш", { firstLogin: null });
    await change(never, "rooms", "venue", ago(DAY));
    expect(await listCoupleNotifications(never)).toEqual([]);
  });

  it("25-day reminder appears only within 25 days, event not past, nothing sent", async () => {
    const far = await newEvent("Далеку", { daysAhead: 40 });
    expect((await listCoupleNotifications(far)).filter((n) => n.kind === "reminder")).toEqual([]);

    const near = await newEvent("Блиску", { daysAhead: 22 });
    const items = (await listCoupleNotifications(near)).filter((n) => n.kind === "reminder");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: `rem25-${near}`, title: "Испратете ги конечните бројки до салата", unseen: false });
    expect(Date.parse(items[0].at)).toBeLessThanOrEqual(Date.now());

    const m = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Р" }).select("id").single()).data!.id;
    await admin.from("event_menu_submissions").insert({ event_id: near, sent_by: "Младенците", counts: { [m]: 1 }, menu_titles: { [m]: "Р" }, total: 1 });
    expect((await listCoupleNotifications(near)).filter((n) => n.kind === "reminder")).toEqual([]);

    const past = await newEvent("Минато", { daysAhead: -3 });
    expect((await listCoupleNotifications(past)).filter((n) => n.kind === "reminder")).toEqual([]);
  });

  it("late events: no 25-day reminder when created fewer than 25 days before the event", async () => {
    // Event 20 days out: created 5 days ago = 25 days before it (reminder), 4 days ago = 24 (none).
    const onTime = await newEvent("На време", { daysAhead: 20, createdDaysAgo: 5 });
    expect((await listCoupleNotifications(onTime)).filter((n) => n.id.startsWith("rem25-"))).toHaveLength(1);
    const late = await newEvent("Доцна", { daysAhead: 20, createdDaysAgo: 4 });
    expect((await listCoupleNotifications(late)).filter((n) => n.id.startsWith("rem25-"))).toEqual([]);
  });

  it("guest replies on a past event are never unseen", async () => {
    const e = await newEvent("Минати одговори", { daysAhead: -2 });
    await admin.from("audit_log").insert({ actor_type: "guest", action: "public_rsvp", venue_id: venueId, event_id: e, target_id: null, details: { new_status: "confirmed" }, occurred_at: ago(5 * DAY) });
    const notes = (await listCoupleNotifications(e)).filter((n) => n.kind === "guest_reply");
    expect(notes).toHaveLength(1);
    expect(notes[0].unseen).toBe(false);
  });

  it("numbers the venue entered: a yellow item with counts and total, unseen until Видено or a newer send", async () => {
    const e = await newEvent("Бројки од салата");
    const m1 = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Класично" }).select("id").single()).data!.id;
    const m2 = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Посно" }).select("id").single()).data!.id;
    const before = ago(20 * DAY); // before the first login: not listed
    await admin.from("event_menu_submissions").insert({ event_id: e, sent_by: "Салата", counts: { [m1]: 1 }, menu_titles: { [m1]: "Класично" }, total: 1, source: "venue", sent_at: before });
    const sentAt = (await admin
      .from("event_menu_submissions")
      .insert({ event_id: e, sent_by: "Салата", counts: { [m1]: 40, [m2]: 5 }, menu_titles: { [m1]: "Класично", [m2]: "Посно" }, total: 45, source: "venue", sent_at: ago(2 * DAY) })
      .select("sent_at")
      .single()).data!.sent_at as string;

    let items = (await listCoupleNotifications(e)).filter((n) => n.section === "menu_numbers");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "venue_change", section: "menu_numbers", title: "Внесено од салата", unseen: true, detail: "Класично: 40 · Посно: 5 · Вкупно: 45" });
    expect(Date.parse(items[0].at)).toBe(Date.parse(sentAt));

    expect((await seen(e, "menu_numbers", items[0].at)).status).toBe(200);
    items = (await listCoupleNotifications(e)).filter((n) => n.section === "menu_numbers");
    expect(items[0].unseen).toBe(false);

    // A newer couple send supersedes a newer venue entry too.
    const e2 = await newEvent("Заменети бројки");
    await admin.from("event_menu_submissions").insert({ event_id: e2, sent_by: "Салата", counts: { [m1]: 3 }, menu_titles: { [m1]: "Класично" }, total: 3, source: "venue", sent_at: ago(2 * DAY) });
    await admin.from("event_menu_submissions").insert({ event_id: e2, sent_by: "Младенците", counts: { [m1]: 4 }, menu_titles: { [m1]: "Класично" }, total: 4, source: "couple", sent_at: ago(DAY) });
    items = (await listCoupleNotifications(e2)).filter((n) => n.section === "menu_numbers");
    expect(items).toHaveLength(1);
    expect(items[0].unseen).toBe(false);
  });

  it("numbers the cron auto-sent appear in the feed too, but never as unseen", async () => {
    const e = await newEvent("Автоматски бројки");
    const m = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Класично" }).select("id").single()).data!.id;
    const sentAt = (await admin
      .from("event_menu_submissions")
      .insert({ event_id: e, sent_by: "Систем", counts: { [m]: 3 }, menu_titles: { [m]: "Класично" }, total: 3, source: "auto", unanswered: 2, sent_at: ago(DAY) })
      .select("sent_at")
      .single()).data!.sent_at as string;

    const items = (await listCoupleNotifications(e)).filter((n) => n.section === "menu_numbers");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "venue_change", section: "menu_numbers", title: "Автоматски испратени бројки", unseen: false });
    expect(items[0].detail).toBe("Класично: 3 · Вкупно: 3 · Испратено автоматски — непотполно");
    expect(Date.parse(items[0].at)).toBe(Date.parse(sentAt));
  });

  it("venue reminders are listed, never unseen", async () => {
    const e = await newEvent("Потсетник", { daysAhead: 90 });
    const { data } = await admin.from("event_couple_reminders").insert({ event_id: e, reminded_by: "Менаџер" }).select("id").single();
    const notes = await listCoupleNotifications(e);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: `rem-${data!.id}`, kind: "reminder", title: "Салата ве потсети да ги испратите бројките", unseen: false });
  });
});
