// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { dotsFor, loadCoupleMarks } from "@/lib/couple/change-marks";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let venueId: string;
let menuId: string;

const DAY = 86_400_000;
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function newEvent(name: string, opts: { daysAhead?: number; firstLogin?: string | null } = {}): Promise<string> {
  const { data, error } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: name, event_date: isoDate(opts.daysAhead ?? 200), couple_first_login_at: opts.firstLogin === undefined ? ago(10 * DAY) : opts.firstLogin })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function change(eventId: string, section: string, changedAt: string) {
  const { error } = await admin
    .from("event_changes")
    .insert({ event_id: eventId, section, side: "venue", changed_by: "Салата", field: "x", old_value: { count: 10 }, new_value: { count: 50 }, changed_at: changedAt });
  if (error) throw error;
}

async function numbers(eventId: string, source: "venue" | "couple", sentAt: string) {
  const { error } = await admin
    .from("event_menu_submissions")
    .insert({ event_id: eventId, sent_by: source === "venue" ? "Салата" : "Младенците", counts: { [menuId]: 5 }, menu_titles: { [menuId]: "М" }, total: 5, source, sent_at: sentAt });
  if (error) throw error;
}

async function reply(eventId: string, guestId: string | null, occurredAt: string) {
  const { error } = await admin
    .from("audit_log")
    .insert({ actor_type: "guest", action: "public_rsvp", venue_id: venueId, event_id: eventId, target_id: guestId, details: { new_status: "confirmed" }, occurred_at: occurredAt });
  if (error) throw error;
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `CoupleMarks ${Date.now()}` }).select("id").single()).data!.id;
  menuId = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "М" }).select("id").single()).data!.id;
}, 60_000);
afterAll(async () => {
  if (venueId) await admin.from("venues").delete().eq("id", venueId);
});

describe("loadCoupleMarks / dotsFor", () => {
  it("changes: only the venue's, after first login; dots follow the section", async () => {
    const e = await newEvent("Промени");
    await change(e, "rooms", ago(20 * DAY)); // before first login
    await change(e, "menus", ago(DAY));
    await change(e, "finance", ago(DAY));
    const marks = await loadCoupleMarks(e);
    expect(Object.keys(marks.unseen).sort()).toEqual(["finance", "menus"]);
    expect(dotsFor(marks)).toEqual({ menu: true, guests: false, budget: true, notifications: true });
  });

  it("couple that never logged in: no change marks and no venue-numbers box or dot", async () => {
    const e = await newEvent("Без најава", { firstLogin: null });
    await change(e, "menus", ago(DAY));
    await numbers(e, "venue", ago(DAY));
    const marks = await loadCoupleMarks(e);
    expect(marks.unseen).toEqual({});
    expect(marks.venueNumbersUnseen).toBeNull();
    expect(dotsFor(marks).menu).toBe(false);
  });

  it("venue numbers entered before first login are not new; after it they are, with a Мени dot", async () => {
    const e = await newEvent("Бројки пред најава", { firstLogin: ago(5 * DAY) });
    await numbers(e, "venue", ago(8 * DAY));
    let marks = await loadCoupleMarks(e);
    expect(marks.venueNumbersUnseen).toBeNull();
    expect(dotsFor(marks).menu).toBe(false);
    await numbers(e, "venue", ago(DAY));
    marks = await loadCoupleMarks(e);
    expect(marks.venueNumbersUnseen?.source).toBe("venue");
    expect(dotsFor(marks).menu).toBe(true);
  });

  it("venue numbers stop counting once a newer couple send supersedes them", async () => {
    const e = await newEvent("Заменети");
    await numbers(e, "venue", ago(2 * DAY));
    expect((await loadCoupleMarks(e)).venueNumbersUnseen?.source).toBe("venue");
    await numbers(e, "couple", ago(DAY));
    const marks = await loadCoupleMarks(e);
    expect(marks.venueNumbersUnseen).toBeNull();
    expect(dotsFor(marks).menu).toBe(false);
  });

  it("only source='venue' submissions count", async () => {
    const e = await newEvent("Само салата");
    await numbers(e, "couple", ago(DAY));
    const marks = await loadCoupleMarks(e);
    expect(marks.venueNumbersUnseen).toBeNull();
    expect(dotsFor(marks).menu).toBe(false);
  });

  it("past event: no marks at all", async () => {
    const e = await newEvent("Минат", { daysAhead: -3 });
    await change(e, "menus", ago(DAY));
    await numbers(e, "venue", ago(DAY));
    await reply(e, null, ago(DAY));
    const marks = await loadCoupleMarks(e);
    expect(marks).toEqual({ unseen: {}, venueNumbersUnseen: null, newReplies: [] });
    expect(dotsFor(marks)).toEqual({ menu: false, guests: false, budget: false, notifications: false });
  });

  it("guest replies count even before first login and with no guest row (null guestId); the newest can be cleared", async () => {
    const e = await newEvent("Одговори", { firstLogin: null });
    const t1 = ago(2 * DAY);
    const t2 = ago(DAY);
    await reply(e, null, t1);
    await reply(e, null, t2);
    let marks = await loadCoupleMarks(e);
    expect(marks.newReplies).toHaveLength(2);
    expect(marks.newReplies[0].guestId).toBeNull();
    expect(dotsFor(marks).guests).toBe(true);
    // Видено up to the newest reply clears the dot.
    const { error } = await admin.rpc("mark_change_seen", { p_event_id: e, p_viewer: "couple", p_section: "guest_replies", p_up_to: marks.newReplies[0].at, p_seen_by: "Младенците" });
    if (error) throw error;
    marks = await loadCoupleMarks(e);
    expect(marks.newReplies).toEqual([]);
    expect(dotsFor(marks).guests).toBe(false);
  });
});
