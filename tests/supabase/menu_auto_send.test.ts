// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// One event's numbers can be made to fail, to show the run carries on.
const failing = vi.hoisted(() => ({ eventId: null as string | null }));
const logSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/log", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/log")>()), log: logSpy }));
vi.mock("@/lib/couple/menu-submissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/couple/menu-submissions")>();
  return {
    ...actual,
    currentMenuNumbers: (eventId: string) => (eventId === failing.eventId ? Promise.reject(new Error("boom")) : actual.currentMenuNumbers(eventId)),
  };
});

import { runMenuAutoSend } from "@/lib/couple/menu-auto-send";
import { listMenuSubmissions } from "@/lib/couple/menu-submissions";
import { todayIn } from "@/lib/date";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let menuA: string;
let menuB: string;

function inDays(n: number): string {
  const d = new Date(`${todayIn()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function newEvent(name: string, daysAway: number, createdDaysAgo = 100, menus = true): Promise<string> {
  const created = new Date(Date.now() - createdDaysAgo * 86_400_000).toISOString();
  const { data, error } = await admin.from("events").insert({ venue_id: venueId, couple_names: name, event_date: inDays(daysAway), created_at: created }).select("id").single();
  if (error) throw error;
  if (menus) {
    const { error: e2 } = await admin.from("event_menu_templates").insert([menuA, menuB].map((m) => ({ event_id: data.id, menu_template_id: m })));
    if (e2) throw e2;
  }
  return data.id;
}

async function guest(eventId: string, name: string, status: string, counts: Record<string, number> = {}) {
  const { data, error } = await admin.from("event_guests").insert({ event_id: eventId, full_name: name, rsvp_status: status, party_size: 2 }).select("id").single();
  if (error) throw error;
  const rows = Object.entries(counts).map(([menu_template_id, count]) => ({ guest_id: data.id, menu_template_id, count }));
  if (rows.length) {
    const { error: e2 } = await admin.from("event_guest_menu_counts").insert(rows);
    if (e2) throw e2;
  }
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `AutoSend ${stamp}` }).select("id").single()).data!.id;
  menuA = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Класично" }).select("id").single()).data!.id;
  menuB = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Посно" }).select("id").single()).data!.id;
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("runMenuAutoSend", () => {
  it("sends once with the confirmed numbers and the unanswered count; a second run does nothing", async () => {
    const e = await newEvent("Автоматски", 10);
    await guest(e, "Ана", "confirmed", { [menuA]: 1, [menuB]: 1 });
    await guest(e, "Бојан", "later");
    await guest(e, "Вера", "declined");

    expect((await runMenuAutoSend(new Date())).sent).toContain(e);
    const [sub] = await listMenuSubmissions(e);
    expect(sub).toMatchObject({ sentBy: "Автоматски", source: "auto", unanswered: 1, seenAt: null });
    expect(sub.numbers.total).toBe(2);
    expect(sub.numbers.menus).toEqual([
      { id: menuA, name: "Класично", count: 1 },
      { id: menuB, name: "Посно", count: 1 },
    ]);

    expect((await runMenuAutoSend(new Date())).sent).not.toContain(e);
    expect(await listMenuSubmissions(e, 5)).toHaveLength(1);
  });

  it("the insert itself refuses an event that already has a submission", async () => {
    const e = await newEvent("Гонка", 5);
    const args = { p_event_id: e, p_counts: { [menuA]: 1 }, p_titles: { [menuA]: "Класично" }, p_total: 1, p_unanswered: 0 };
    expect((await admin.rpc("insert_auto_menu_submission", args)).data).toBe(true);
    expect((await admin.rpc("insert_auto_menu_submission", args)).data).toBe(false);
  });

  it("does nothing for events with no menus, created late, far away, past, already sent or erased", async () => {
    const noMenus = await newEvent("Без мени", 10, 100, false);
    const late = await newEvent("Доцна", 10, 3);
    const far = await newEvent("Далеку", 16);
    const past = await newEvent("Минат", -1);
    const sent = await newEvent("Испратено", 10);
    await admin.from("event_menu_submissions").insert({ event_id: sent, sent_by: "Младенците", counts: {}, menu_titles: {}, total: 0 });
    const erased = await newEvent("Избришан", 10);
    await admin.from("events").update({ personal_data_erased_at: new Date().toISOString() }).eq("id", erased);

    const { sent: ids } = await runMenuAutoSend(new Date());
    for (const e of [noMenus, late, far, past, erased]) {
      expect(ids).not.toContain(e);
      expect(await listMenuSubmissions(e, 5)).toHaveLength(0);
    }
    expect(ids).not.toContain(sent);
    expect(await listMenuSubmissions(sent, 5)).toHaveLength(1);
  });

  it("skips cancelled events", async () => {
    const cancelled = await newEvent("Откажан", 10);
    const { error } = await admin.from("events").update({ status: "cancelled" }).eq("id", cancelled);
    if (error) throw error;
    expect((await runMenuAutoSend(new Date())).sent).not.toContain(cancelled);
    expect(await listMenuSubmissions(cancelled, 5)).toHaveLength(0);
  });

  it("one failing event does not stop the events after it", async () => {
    const bad = await newEvent("Грешка", 3); // earlier date: processed first
    const good = await newEvent("Продолжува", 12);
    failing.eventId = bad;
    logSpy.mockClear();
    try {
      const { sent } = await runMenuAutoSend(new Date());
      expect(sent).not.toContain(bad);
      expect(sent).toContain(good);
      expect(logSpy).toHaveBeenCalledWith("error", "menu_auto_send_failed", expect.objectContaining({ event_id: bad, error_message: "boom" }));
    } finally {
      failing.eventId = null;
    }
  });

  it("sends on the 15th day and on the event day", async () => {
    const fifteen = await newEvent("Петнаесет", 15);
    const today = await newEvent("Денес", 0);
    const { sent } = await runMenuAutoSend(new Date());
    expect(sent).toContain(fifteen);
    expect(sent).toContain(today);
  });
});
