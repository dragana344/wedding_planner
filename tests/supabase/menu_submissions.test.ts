// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GET, POST } from "@/app/api/couple/menu-numbers/route";
import { currentMenuNumbers, listMenuSubmissions, sendMenuNumbers } from "@/lib/couple/menu-submissions";
import { diffMenuNumbers } from "@/lib/menu-numbers";

const STAFF_EMAIL = `submissions-staff-${Date.now()}@test.local`;
const STAFF_PASSWORD = "staff-password-123";

vi.mock("@/lib/supabase/server", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  return {
    createServerSupabaseClient: async () => {
      const c = create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      await c.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
      return c;
    },
  };
});

import { POST as seenRoute } from "@/app/api/venue/events/[eventId]/menu-numbers/seen/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";
import { listEventsWithDetails } from "@/lib/venue/events";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let menuA: string; // Класично
let menuB: string; // Посно
let staffUserId: string;
let managerToken: string;
let staffClient: ReturnType<typeof createClient>;

async function newEvent(name: string): Promise<string> {
  const { data, error } = await admin.from("events").insert({ venue_id: venueId, couple_names: name, event_date: "2030-06-01" }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function link(eventId: string, ...menus: string[]) {
  const { error } = await admin.from("event_menu_templates").insert(menus.map((m) => ({ event_id: eventId, menu_template_id: m })));
  if (error) throw error;
}

async function guest(eventId: string, name: string, fields: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin.from("event_guests").insert({ event_id: eventId, full_name: name, ...fields }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function counts(guestId: string, c: Record<string, number>) {
  await admin.from("event_guest_menu_counts").delete().eq("guest_id", guestId);
  const rows = Object.entries(c).map(([menu_template_id, count]) => ({ guest_id: guestId, menu_template_id, count }));
  if (rows.length) {
    const { error } = await admin.from("event_guest_menu_counts").insert(rows);
    if (error) throw error;
  }
}

function req(method: string, eventId: string, side?: string) {
  const headers: Record<string, string> = { "x-couple-event-id": eventId };
  if (side) headers["x-couple-organizer-side"] = side;
  return new NextRequest("http://localhost/api/couple/menu-numbers", { method, headers });
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Submissions ${stamp}` }).select("id").single()).data!.id;
  menuA = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Класично" }).select("id").single()).data!.id;
  menuB = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Посно" }).select("id").single()).data!.id;
  const { data: user, error } = await admin.auth.admin.createUser({ email: STAFF_EMAIL, password: STAFF_PASSWORD, email_confirm: true });
  if (error) throw error;
  staffUserId = user.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: venueId });
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер Мени", p_password: "manager-pass-1", p_is_owner: false })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер Мени", false)).token;
  staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staffClient.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
}, 60_000);

afterAll(async () => {
  if (staffUserId) await admin.auth.admin.deleteUser(staffUserId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("couple menu numbers", () => {
  it("refuses to send without menus", async () => {
    const e = await newEvent("Без мени");
    await expect(sendMenuNumbers(e)).rejects.toThrow("Салата сè уште нема поставено мени.");
    const res = await POST(req("POST", e), { params: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Салата сè уште нема поставено мени.");
  });

  it("send recomputes not-done server-side", async () => {
    const e = await newEvent("Не готово");
    await link(e, menuA, menuB);
    const g = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 2 });
    await counts(g, { [menuA]: 1, [menuB]: 1 });
    expect((await currentMenuNumbers(e)).notDone).toHaveLength(0);
    await admin.from("event_guests").update({ rsvp_status: "later" }).eq("id", g);
    await expect(sendMenuNumbers(e)).rejects.toThrow("Уште 1 гостин нема конечен одговор.");
    expect(await listMenuSubmissions(e)).toHaveLength(0);
  });

  it("co-organizer cannot send", async () => {
    const e = await newEvent("Ко-организатор");
    await link(e, menuA);
    const res = await POST(req("POST", e, "bride"), { params: {} });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Само главната најава на младенците може да ги испрати бројките.");
    expect(await listMenuSubmissions(e)).toHaveLength(0);
  });

  it("snapshot stores counts and titles; later guest edits don't change it", async () => {
    const e = await newEvent("Снимка");
    await link(e, menuA, menuB);
    const g = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 3 });
    await counts(g, { [menuA]: 2, [menuB]: 1 });
    const sent = await sendMenuNumbers(e);
    expect(sent.sentBy).toBe("Младенците");
    expect(sent.numbers.total).toBe(3);
    expect(sent.numbers.menus).toEqual([
      { id: menuA, name: "Класично", count: 2 },
      { id: menuB, name: "Посно", count: 1 },
    ]);
    await counts(g, { [menuA]: 1, [menuB]: 2 });
    const [latest] = await listMenuSubmissions(e);
    expect(latest.numbers).toEqual(sent.numbers);
    expect((await currentMenuNumbers(e)).numbers.menus.map((m) => m.count)).toEqual([1, 2]);
  });

  it("changedSinceLatest after a guest declines", async () => {
    const e = await newEvent("Одбива");
    await link(e, menuA, menuB);
    const g1 = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 2 });
    await counts(g1, { [menuA]: 1, [menuB]: 1 });
    const before = await (await GET(req("GET", e), { params: {} })).json();
    expect(before.latest).toBeNull();
    expect(before.changedSinceLatest).toBe(false);
    await sendMenuNumbers(e);
    expect((await (await GET(req("GET", e), { params: {} })).json()).changedSinceLatest).toBe(false);
    await admin.from("event_guests").update({ rsvp_status: "declined" }).eq("id", g1);
    const after = await (await GET(req("GET", e), { params: {} })).json();
    expect(after.changedSinceLatest).toBe(true);
    expect(after.latest.numbers.total).toBe(2);
    expect(after.current.total).toBe(0);
  });

  it("removing a menu after sending is a change and keeps the old snapshot titles", async () => {
    const e = await newEvent("Бришење мени");
    await link(e, menuA, menuB);
    const g = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 2 });
    await counts(g, { [menuA]: 1, [menuB]: 1 });
    await sendMenuNumbers(e);
    await admin.from("event_menu_templates").delete().eq("event_id", e).eq("menu_template_id", menuB);
    await admin.from("menu_templates").update({ name: "Преименувано" }).eq("id", menuB);
    const body = await (await GET(req("GET", e), { params: {} })).json();
    expect(body.changedSinceLatest).toBe(true);
    expect(body.latest.numbers.menus.map((m: { name: string }) => m.name)).toEqual(["Класично", "Посно"]);
  });
});

describe("diffMenuNumbers", () => {
  it("diff lists only changed menus", () => {
    const prev = { menus: [{ id: "a", name: "Класично", count: 3 }, { id: "b", name: "Посно", count: 1 }, { id: "c", name: "Старо", count: 2 }], total: 6 };
    const next = { menus: [{ id: "a", name: "Класично", count: 3 }, { id: "b", name: "Посно", count: 2 }, { id: "d", name: "Ново", count: 1 }], total: 6 };
    expect(diffMenuNumbers(prev, next)).toEqual([
      { name: "Посно", from: 1, to: 2 },
      { name: "Ново", from: 0, to: 1 },
      { name: "Старо", from: 2, to: 0 },
    ]);
  });
});

describe("venue sees the numbers (Видено)", () => {
  function seenReq(eventId: string, token?: string, submissionId?: string) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers[MANAGER_TOKEN_HEADER] = token;
    return seenRoute(new NextRequest(`http://localhost/api/venue/events/${eventId}/menu-numbers/seen`, { method: "POST", headers, body: JSON.stringify({ submission_id: submissionId ?? "00000000-0000-4000-8000-000000000000" }) }), { params: Promise.resolve({ eventId }) });
  }
  async function eventWithTwoSendings() {
    const e = await newEvent("Две испраќања");
    await link(e, menuA, menuB);
    const g = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 2 });
    await counts(g, { [menuA]: 1, [menuB]: 1 });
    await sendMenuNumbers(e);
    await counts(g, { [menuB]: 2 });
    await sendMenuNumbers(e);
    return e;
  }
  const detailOf = async (e: string) => (await listEventsWithDetails(venueId, staffClient as never)).find((x) => x.id === e)!;

  it("the event carries the newest two sendings, staff-readable", async () => {
    const e = await eventWithTwoSendings();
    const third = await newEvent("Само едно");
    const { latest, previous } = (await detailOf(e)).menuNumbers;
    expect(latest?.numbers.menus.map((m) => m.count)).toEqual([0, 2]);
    expect(previous?.numbers.menus.map((m) => m.count)).toEqual([1, 1]);
    expect(latest?.seenAt).toBeNull();
    expect((await detailOf(third)).menuNumbers).toEqual({ latest: null, previous: null });
  });

  it("manager 200 marks only the latest, with their name; repeating changes nothing", async () => {
    const e = await eventWithTwoSendings();
    const res = await seenReq(e, managerToken, (await detailOf(e)).menuNumbers.latest!.id);
    expect(res.status).toBe(200);
    const first = (await detailOf(e)).menuNumbers;
    expect(first.latest?.seenAt).not.toBeNull();
    expect(first.latest?.seenBy).toBe("Менаџер Мени");
    expect(first.previous?.seenAt).toBeNull();
    expect((await seenReq(e, managerToken, first.latest!.id)).status).toBe(200);
    expect((await detailOf(e)).menuNumbers.latest?.seenAt).toBe(first.latest?.seenAt);
  });

  it("staff without elevation get 403 and nothing changes", async () => {
    const e = await eventWithTwoSendings();
    const res = await seenReq(e);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Потребна е најава како менаџер.");
    expect((await detailOf(e)).menuNumbers.latest?.seenAt).toBeNull();
  });

  it("404 when the event has no sendings", async () => {
    const e = await newEvent("Без испраќање");
    expect((await seenReq(e, managerToken)).status).toBe(404);
  });

  it("a newer sending after the page loaded: the old id gets 409 and nothing is marked; the current id gets 200", async () => {
    const e = await eventWithTwoSendings();
    const shown = (await detailOf(e)).menuNumbers.latest!;
    const g = (await admin.from("event_guests").select("id").eq("event_id", e).single()).data!.id;
    await counts(g, { [menuA]: 2 });
    await sendMenuNumbers(e);
    const res = await seenReq(e, managerToken, shown.id);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Парот испрати нови бројки — освежете.");
    const rows = (await admin.from("event_menu_submissions").select("seen_at").eq("event_id", e)).data!;
    expect(rows.every((r) => r.seen_at === null)).toBe(true);
    const current = (await detailOf(e)).menuNumbers.latest!;
    expect((await seenReq(e, managerToken, current.id)).status).toBe(200);
  });
});
