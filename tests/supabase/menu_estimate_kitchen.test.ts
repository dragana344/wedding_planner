// @vitest-environment node
// Group B, task B4 (0182/0183): menu numbers with an estimate, change marks
// after sending, the venue's kitchen sheet, contracted vs final price,
// restoring an archived package, and erasure of the allergy fingerprint.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const STAFF_EMAIL = `b4-staff-${Date.now()}@test.local`;
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

import { GET as menuNumbersGet, POST as menuNumbersPost } from "@/app/api/couple/menu-numbers/route";
import * as guestRoute from "@/app/api/couple/guests/[id]/route";
import { POST as venueSeen } from "@/app/api/venue/events/[eventId]/changes/seen/route";
import { PATCH as financePatch } from "@/app/api/venue/events/[eventId]/finance/route";
import { listMenuSubmissions, sendMenuNumbers } from "@/lib/couple/menu-submissions";
import { recordNumbersChange } from "@/lib/couple/numbers-changes";
import { kitchenSheetData } from "@/lib/venue/kitchen-sheet";
import { listEventPrivateDetails } from "@/lib/venue/events";
import { deleteMenuTemplate, listArchivedMenuTemplates, listMenuTemplates, restoreMenuTemplate } from "@/lib/venue/menus";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let menuA: string; // Класично
let menuB: string; // Посно
let staffUserId: string;
let managerToken: string;
let staffClient: ReturnType<typeof createClient>;

async function newEvent(name: string, date = "2030-06-01"): Promise<string> {
  const { data, error } = await admin.from("events").insert({ venue_id: venueId, couple_names: name, event_date: date }).select("id").single();
  if (error) throw error;
  const { error: linkError } = await admin.from("event_menu_templates").insert([menuA, menuB].map((m) => ({ event_id: data.id, menu_template_id: m })));
  if (linkError) throw linkError;
  return data.id;
}

async function guest(eventId: string, name: string, fields: Record<string, unknown>, counts: Record<string, number> = {}): Promise<string> {
  const { data, error } = await admin.from("event_guests").insert({ event_id: eventId, full_name: name, ...fields }).select("id").single();
  if (error) throw error;
  const rows = Object.entries(counts).map(([menu_template_id, count]) => ({ guest_id: data.id, menu_template_id, count }));
  if (rows.length) {
    const { error: e2 } = await admin.from("event_guest_menu_counts").insert(rows);
    if (e2) throw e2;
  }
  return data.id;
}

function coupleReq(method: string, eventId: string, url: string, body?: unknown) {
  const headers: Record<string, string> = { "x-couple-event-id": eventId };
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function patchGuest(eventId: string, guestId: string, body: unknown) {
  const res = await guestRoute.PATCH(coupleReq("PATCH", eventId, `/api/couple/guests/${guestId}`, body), { params: Promise.resolve({ id: guestId }) });
  expect(res.status).toBe(200);
}

async function numbersMarks(eventId: string) {
  const { data, error } = await admin.from("event_changes").select("side, changed_by, field, new_value").eq("event_id", eventId).eq("section", "numbers").order("changed_at");
  if (error) throw error;
  return data ?? [];
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `B4 ${stamp}` }).select("id").single()).data!.id;
  menuA = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Класично" }).select("id").single()).data!.id;
  menuB = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Посно" }).select("id").single()).data!.id;
  const { data: user, error } = await admin.auth.admin.createUser({ email: STAFF_EMAIL, password: STAFF_PASSWORD, email_confirm: true });
  if (error) throw error;
  staffUserId = user.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: venueId });
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер Б4", p_password: "manager-pass-1", p_is_owner: false })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер Б4", false)).token;
  staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staffClient.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
}, 60_000);

afterAll(async () => {
  if (staffUserId) await admin.auth.admin.deleteUser(staffUserId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("send with an estimate (decision 9)", () => {
  it("GET counts who answered and prefills the rest from invited_party_size, else party_size, split like the real counts", async () => {
    const e = await newEvent("Проценка");
    await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 4 }, { [menuA]: 3, [menuB]: 1 });
    await guest(e, "Вера", { rsvp_status: "declined" });
    await guest(e, "Бојан", { rsvp_status: "invited", party_size: 1, invited_party_size: 6 });
    await guest(e, "Гоце", { rsvp_status: "later", party_size: 2 });
    const res = await menuNumbersGet(coupleReq("GET", e, "/api/couple/menu-numbers"), { params: {} });
    const body = await res.json();
    expect(body.answers).toEqual({ answeredGuests: 2, answeredPeople: 4, unansweredGuests: 2, unansweredPeople: 8 });
    expect(body.prefill).toEqual({ [menuA]: 6, [menuB]: 2 });
  });

  it("stores real and estimated counts apart, with the unanswered count; refuses an unknown menu", async () => {
    const e = await newEvent("Со проценка");
    await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 2, children_count: 1, no_meal_count: 1 }, { [menuA]: 1 });
    await guest(e, "Бојан", { rsvp_status: "invited", party_size: 3 });
    await expect(sendMenuNumbers(e, null, { [crypto.randomUUID()]: 1 })).rejects.toThrow("Проценката е за мени што го нема на настанот.");

    const res = await menuNumbersPost(coupleReq("POST", e, "/api/couple/menu-numbers", { allergy_summary: null, estimate: { [menuA]: 2, [menuB]: 1 } }), { params: {} });
    expect(res.status).toBe(200);
    const [sub] = await listMenuSubmissions(e);
    expect(sub.numbers).toMatchObject({ total: 1, noMeal: 1 });
    expect(sub.unanswered).toBe(1);
    expect(sub.estimate).toEqual({
      menus: [
        { id: menuA, name: "Класично", count: 2 },
        { id: menuB, name: "Посно", count: 1 },
      ],
      total: 3,
    });
  });

  it("0184: a guest the estimate already counted answering is no change; a decline, a new person or a different menu is", async () => {
    const e = await newEvent("Проценка се троши");
    await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 2 }, { [menuA]: 2 });
    const bojan = await guest(e, "Бојан", { rsvp_status: "invited", party_size: 2 });
    const gordana = await guest(e, "Гордана", { rsvp_status: "invited", party_size: 2 });
    // The couple estimates the 4 unanswered people all on Класично.
    const sent = await sendMenuNumbers(e, null, { [menuA]: 4, [menuB]: 0 });
    expect(sent.estimatedPeople).toBe(4);

    // Бојан confirms as estimated: 2 real Класично, 2 less estimate — nothing for the venue.
    await patchGuest(e, bojan, { type: "status", rsvp_status: "confirmed" });
    await patchGuest(e, bojan, { type: "menus", counts: { [menuA]: 2 } });
    expect(await numbersMarks(e)).toEqual([]);
    const get = async () => (await (await menuNumbersGet(coupleReq("GET", e, "/api/couple/menu-numbers"), { params: {} })).json()) as { changedSinceLatest: boolean; changesSinceLatest: unknown[] };
    expect(await get()).toMatchObject({ changedSinceLatest: false, changesSinceLatest: [] });

    // Гордана declines: the estimate shrinks by her 2 — that is a change.
    await patchGuest(e, gordana, { type: "status", rsvp_status: "declined" });
    const marks = await numbersMarks(e);
    expect(marks).toHaveLength(1);
    expect(marks[0].new_value.changes).toEqual([{ name: "Класично", from: 6, to: 4 }]);
    expect(await get()).toMatchObject({ changedSinceLatest: true, changesSinceLatest: [{ name: "Класично", from: 6, to: 4 }] });
  });

  it("everyone answered: the old path, no estimate", async () => {
    const e = await newEvent("Сите");
    await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 1 }, { [menuB]: 1 });
    const sent = await sendMenuNumbers(e, null, { [menuA]: 9 });
    expect(sent.estimate).toBeNull();
    expect(sent.unanswered).toBeNull();
  });
});

describe("changes after sending (decision 10)", () => {
  it("nothing before the first sending; then each move is marked once, for the venue", async () => {
    const e = await newEvent("Промени");
    const ana = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 2 }, { [menuA]: 2 });
    const boj = await guest(e, "Бојан", { rsvp_status: "confirmed", party_size: 1 }, { [menuB]: 1 });
    await patchGuest(e, ana, { type: "status", rsvp_status: "confirmed" });
    expect(await numbersMarks(e)).toHaveLength(0);

    await sendMenuNumbers(e);
    expect(await recordNumbersChange(e, "Младенците")).toBe(false);

    await patchGuest(e, ana, { type: "menus", counts: { [menuA]: 1, [menuB]: 1 } });
    await patchGuest(e, boj, { type: "status", rsvp_status: "declined" });
    const marks = await numbersMarks(e);
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatchObject({ side: "couple", changed_by: "Младенците", field: "after_sent" });
    expect(marks[0].new_value.changes).toEqual([
      { name: "Класично", from: 2, to: 1 },
      { name: "Посно", from: 1, to: 2 },
    ]);
    // The second mark is measured from the first, not from the sending.
    expect(marks[1].new_value.changes).toEqual([{ name: "Посно", from: 2, to: 1 }]);
    expect(await recordNumbersChange(e, "Младенците")).toBe(false);

    // The couple's screen says the numbers moved since sending.
    const body = await (await menuNumbersGet(coupleReq("GET", e, "/api/couple/menu-numbers"), { params: {} })).json();
    expect(body.changedSinceLatest).toBe(true);
  });

  it("an allergy change is marked (no text in the log); the venue confirms it with Видено", async () => {
    const e = await newEvent("Алергии");
    const ana = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 1, allergies: "ореви" }, { [menuA]: 1 });
    await sendMenuNumbers(e, "1 без ореви");
    await admin.from("event_guests").update({ allergies: "ореви и млеко" }).eq("id", ana);
    expect(await recordNumbersChange(e, "Гостин")).toBe(true);
    const [mark] = await numbersMarks(e);
    expect(mark.new_value.allergies).toBe(true);
    expect(mark.new_value.changes).toEqual([]);
    expect(JSON.stringify(mark.new_value)).not.toContain("млеко");

    const { data: change } = await admin.from("event_changes").select("changed_at").eq("event_id", e).eq("section", "numbers").single();
    const res = await venueSeen(
      new NextRequest(`http://localhost/api/venue/events/${e}/changes/seen`, {
        method: "POST",
        headers: { "content-type": "application/json", [MANAGER_TOKEN_HEADER]: managerToken },
        body: JSON.stringify({ section: "numbers", up_to: change!.changed_at }),
      }),
      { params: Promise.resolve({ eventId: e }) },
    );
    expect(res.status).toBe(200);
    const { data: unseen } = await admin.rpc("venue_unseen_change_sections", { p_venue_id: venueId });
    expect(((unseen ?? []) as { event_id: string; section: string }[]).filter((r) => r.event_id === e && r.section === "numbers")).toEqual([]);
  });

  it("past events get no marks", async () => {
    const e = await newEvent("Минат", "2020-01-01");
    const ana = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 1 }, { [menuA]: 1 });
    await sendMenuNumbers(e);
    await admin.from("event_guests").update({ rsvp_status: "declined" }).eq("id", ana);
    expect(await recordNumbersChange(e, "Младенците")).toBe(false);
  });
});

describe("kitchen sheet (staff client)", () => {
  it("shows the latest numbers with the estimate marked, the raw allergy notes (unseated here) and the changes since", async () => {
    const e = await newEvent("Кујна");
    const ana = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 3, children_count: 1, no_meal_count: 1, allergies: "без глутен" }, { [menuA]: 2 });
    await guest(e, "Бојан", { rsvp_status: "invited", party_size: 2 });
    await sendMenuNumbers(e, null, { [menuA]: 1, [menuB]: 1 });
    await admin.from("event_guests").update({ allergies: "без глутен и јаткасти" }).eq("id", ana);
    await recordNumbersChange(e, "Младенците");

    const data = await kitchenSheetData(staffClient, e, new Date("2030-05-20T10:00:00Z"));
    expect(data.title).toBe("Кујна");
    expect(data.date).toBe("01.06.2030");
    expect(data.menus).toEqual([
      { id: menuA, name: "Класично", count: 3, estimated: 1 },
      { id: menuB, name: "Посно", count: 1, estimated: 1 },
    ]);
    expect({ meals: data.meals, estimated: data.estimated, noMeal: data.noMeal, headcount: data.headcount }).toEqual({ meals: 4, estimated: 2, noMeal: 1, headcount: 5 });
    expect(data.allergyTables).toEqual([]);
    expect(data.allergyUnseated).toEqual([{ guestName: "Ана", menuName: "Класично", text: "без глутен" }]);
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0].text).toMatch(/алергии$/);
    expect(data.generatedAt).toBe("20.05.2030 12:00");
  });

  it("nothing sent yet: an empty sheet, no error", async () => {
    const e = await newEvent("Празно");
    const data = await kitchenSheetData(staffClient, e);
    expect(data.latest).toBeNull();
    expect(data.headcount).toBe(0);
    expect(data.changes).toEqual([]);
  });
});

describe("contracted vs final price (decision 11)", () => {
  it("the finance route stores the per-guest price; staff can't read it; the private list adds confirmed people", async () => {
    const e = await newEvent("Цена");
    await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 3 });
    await guest(e, "Бојан", { rsvp_status: "declined", party_size: 2 });
    const res = await financePatch(
      new NextRequest(`http://localhost/api/venue/events/${e}/finance`, {
        method: "PATCH",
        headers: { "content-type": "application/json", [MANAGER_TOKEN_HEADER]: managerToken },
        body: JSON.stringify({ total_price: 300000, deposit_paid: null, price_per_guest: 1500, contracted_guests: 200 }),
      }),
      { params: Promise.resolve({ eventId: e }) },
    );
    expect(res.status).toBe(200);
    const details = (await listEventPrivateDetails(venueId, admin)).find((d) => d.id === e)!;
    expect(details).toMatchObject({ total_price: 300000, price_per_guest: 1500, contracted_guests: 200, confirmed_people: 3, confirmed_no_meal: 0 });
    const { error } = await staffClient.from("events").select("price_per_guest").eq("id", e);
    expect(error).not.toBeNull();

    // A hand-typed total clears the comparison.
    await financePatch(
      new NextRequest(`http://localhost/api/venue/events/${e}/finance`, {
        method: "PATCH",
        headers: { "content-type": "application/json", [MANAGER_TOKEN_HEADER]: managerToken },
        body: JSON.stringify({ total_price: 310000, deposit_paid: null, price_per_guest: null, contracted_guests: null }),
      }),
      { params: Promise.resolve({ eventId: e }) },
    );
    const after = (await listEventPrivateDetails(venueId, admin)).find((d) => d.id === e)!;
    expect(after).toMatchObject({ total_price: 310000, price_per_guest: null, contracted_guests: null });
    expect(after.confirmed_people).toBeUndefined();
  });
});

describe("archived packages", () => {
  it("staff restore an archived package (Врати): back on the list, off the archive", async () => {
    const pkg = (await admin.from("menu_templates").insert({ venue_id: venueId, name: `Архива ${stamp}` }).select("id").single()).data!.id as string;
    const e = await newEvent("Архива");
    await admin.from("event_menu_templates").insert({ event_id: e, menu_template_id: pkg });
    expect(await deleteMenuTemplate(pkg, staffClient)).toBe("archived");
    expect((await listArchivedMenuTemplates(venueId, staffClient)).map((t) => t.id)).toContain(pkg);
    expect((await listMenuTemplates(venueId, staffClient)).map((t) => t.id)).not.toContain(pkg);
    await restoreMenuTemplate(pkg, staffClient);
    expect((await listArchivedMenuTemplates(venueId, staffClient)).map((t) => t.id)).not.toContain(pkg);
    expect((await listMenuTemplates(venueId, staffClient)).map((t) => t.id)).toContain(pkg);
  });
});

describe("erasure (0183)", () => {
  it("clears the allergy fingerprint on the sending and inside the numbers marks; the counts stay", async () => {
    const e = await newEvent("Бришење");
    const ana = await guest(e, "Ана", { rsvp_status: "confirmed", party_size: 1, allergies: "ореви" }, { [menuA]: 1 });
    const sent = await sendMenuNumbers(e);
    await admin.from("event_guests").update({ rsvp_status: "declined" }).eq("id", ana);
    expect(await recordNumbersChange(e, "Младенците")).toBe(true);
    const { error } = await admin.rpc("erase_event_personal_data", { p_event_id: e });
    expect(error).toBeNull();
    const { data: sub } = await admin.from("event_menu_submissions").select("allergy_key, total").eq("id", sent.id).single();
    expect(sub).toEqual({ allergy_key: null, total: 1 });
    const [mark] = await numbersMarks(e);
    expect(mark.new_value).not.toHaveProperty("allergyKey");
    expect(mark.new_value.changes).toEqual([{ name: "Класично", from: 1, to: 0 }]);
  });
});
