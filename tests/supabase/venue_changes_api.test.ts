// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const STAFF_EMAIL = `venue-changes-staff-${Date.now()}@test.local`;
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

import { GET as changesGet } from "@/app/api/venue/events/[eventId]/changes/route";
import { POST as seenPost } from "@/app/api/venue/events/[eventId]/changes/seen/route";
import { POST as remindPost } from "@/app/api/venue/events/[eventId]/remind-couple/route";
import { POST as numbersPost } from "@/app/api/venue/events/[eventId]/menu-numbers/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";
import { listEventsWithDetails } from "@/lib/venue/events";
import { getSeen } from "@/lib/changes/server";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let menuA: string; // Класично
let menuB: string; // Посно
let staffUserId: string;
let managerToken: string;

async function newEvent(name: string, date = "2030-06-01"): Promise<string> {
  const { data, error } = await admin.from("events").insert({ venue_id: venueId, couple_names: name, event_date: date }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function addChange(eventId: string, section: string, field: string, side: "couple" | "venue" = "couple", changedAt?: string) {
  const row: Record<string, unknown> = { event_id: eventId, section, side, field, old_value: "старо", new_value: "ново" };
  if (changedAt) row.changed_at = changedAt;
  const { data, error } = await admin.from("event_changes").insert(row).select("id, changed_at").single();
  if (error) throw error;
  return data as { id: string; changed_at: string };
}

function call(handler: (r: NextRequest, c: { params: Promise<{ eventId: string }> }) => Promise<Response>, eventId: string, path: string, opts: { token?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = opts.token === undefined ? managerToken : opts.token;
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  const method = opts.body === undefined && handler === changesGet ? "GET" : "POST";
  return handler(
    new NextRequest(`http://localhost/api/venue/events/${eventId}/${path}`, { method, headers, body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined }),
    { params: Promise.resolve({ eventId }) },
  );
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `VenueChanges ${stamp}` }).select("id").single()).data!.id;
  menuA = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Класично" }).select("id").single()).data!.id;
  menuB = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Посно" }).select("id").single()).data!.id;
  const { data: user, error } = await admin.auth.admin.createUser({ email: STAFF_EMAIL, password: STAFF_PASSWORD, email_confirm: true });
  if (error) throw error;
  staffUserId = user.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: venueId });
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер Промени", p_password: "manager-pass-1", p_is_owner: false })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер Промени", false)).token;
}, 60_000);

afterAll(async () => {
  if (staffUserId) await admin.auth.admin.deleteUser(staffUserId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("GET changes", () => {
  it("staff without a manager token sees the sections but not contact/finance values", async () => {
    const e = await newEvent("Редакција");
    await addChange(e, "contact", "contact_phone");
    await addChange(e, "finance", "total_price");
    await addChange(e, "guest_count", "guest_count");
    const res = await call(changesGet, e, "changes", { token: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changes).toHaveLength(3);
    for (const c of body.changes) {
      if (c.section === "guest_count") expect(c.newValue).toBe("ново");
      else expect([c.oldValue, c.newValue]).toEqual([null, null]);
    }
    expect(body.lastReminderAt).toBeNull();
  });

  it("a manager gets the values", async () => {
    const e = await newEvent("Менаџер гледа");
    await addChange(e, "contact", "contact_phone");
    const body = await (await call(changesGet, e, "changes")).json();
    expect(body.changes[0]).toMatchObject({ section: "contact", oldValue: "старо", newValue: "ново" });
  });

  it("all couple-side changes (no time window, so the event window can clear what \"!\" counts), plus seen and the last reminder", async () => {
    const e = await newEvent("Филтер");
    await addChange(e, "guest_count", "guest_count", "venue");
    const old = await addChange(e, "guest_count", "guest_count", "couple", new Date(Date.now() - 61 * 86_400_000).toISOString());
    const fresh = await addChange(e, "guest_count", "guest_count");
    await admin.from("event_couple_reminders").insert({ event_id: e, reminded_by: "Некој", reminded_at: "2030-01-02T10:00:00Z" });
    await admin.rpc("mark_change_seen", { p_event_id: e, p_viewer: "venue", p_section: "contact", p_up_to: "2030-01-01T00:00:00Z", p_seen_by: "Х" });
    const body = await (await call(changesGet, e, "changes")).json();
    expect(body.changes.map((c: { id: string }) => c.id)).toEqual([old.id, fresh.id]);
    expect(Date.parse(body.seen.contact)).toBe(Date.parse("2030-01-01T00:00:00Z"));
    expect(Date.parse(body.lastReminderAt)).toBe(Date.parse("2030-01-02T10:00:00Z"));
  });

  it("another venue's event is not found", async () => {
    const otherVenue = (await admin.from("venues").insert({ name: `Other ${stamp}` }).select("id").single()).data!.id;
    const { data } = await admin.from("events").insert({ venue_id: otherVenue, couple_names: "Туѓ", event_date: "2030-06-01" }).select("id").single();
    expect((await call(changesGet, data!.id, "changes")).status).toBe(404);
    await admin.from("venues").delete().eq("id", otherVenue);
  });
});

describe("POST changes/seen", () => {
  it("staff without a manager token gets 403 and nothing is saved", async () => {
    const e = await newEvent("Без токен");
    const res = await call(seenPost, e, "changes/seen", { token: null, body: { section: "guest_count", up_to: new Date().toISOString() } });
    expect(res.status).toBe(403);
    expect(await getSeen(e, "venue")).toEqual({});
  });

  it("a manager marks seen with their name and the position only moves forward", async () => {
    const e = await newEvent("Видено");
    const a = await addChange(e, "guest_count", "guest_count");
    const res = await call(seenPost, e, "changes/seen", { body: { section: "guest_count", up_to: a.changed_at } });
    expect(await res.json()).toEqual({ ok: true });
    const { data } = await admin.from("event_change_seen").select("seen_by").eq("event_id", e).eq("viewer", "venue").eq("section", "guest_count").single();
    expect(data!.seen_by).toBe("Менаџер Промени");
    await call(seenPost, e, "changes/seen", { body: { section: "guest_count", up_to: "2020-01-01T00:00:00Z" } });
    expect(Date.parse((await getSeen(e, "venue")).guest_count!)).toBe(Date.parse(a.changed_at));
  });

  it("a newer couple change is saved but flagged", async () => {
    const e = await newEvent("Ново");
    const a = await addChange(e, "contact", "contact_phone");
    const b = await addChange(e, "contact", "contact_email");
    const res = await call(seenPost, e, "changes/seen", { body: { section: "contact", up_to: a.changed_at } });
    expect(await res.json()).toEqual({ ok: true, newer: true });
    const ok = await call(seenPost, e, "changes/seen", { body: { section: "contact", up_to: b.changed_at } });
    expect(await ok.json()).toEqual({ ok: true });
  });

  it("rejects an unknown section", async () => {
    const e = await newEvent("Секција");
    const res = await call(seenPost, e, "changes/seen", { body: { section: "finance", up_to: new Date().toISOString() } });
    expect(res.status).toBe(400);
  });
});

describe("POST remind-couple", () => {
  it("staff gets 403", async () => {
    const e = await newEvent("Потсетник без токен");
    expect((await call(remindPost, e, "remind-couple", { token: null })).status).toBe(403);
  });

  it("reminds once a day", async () => {
    const e = await newEvent("Потсетник");
    const first = await call(remindPost, e, "remind-couple");
    expect(first.status).toBe(200);
    const { remindedAt } = await first.json();
    expect(Number.isNaN(Date.parse(remindedAt))).toBe(false);
    const { data } = await admin.from("event_couple_reminders").select("reminded_by").eq("event_id", e);
    expect(data).toEqual([{ reminded_by: "Менаџер Промени" }]);
    const second = await call(remindPost, e, "remind-couple");
    expect(second.status).toBe(429);
    expect((await second.json()).error).toBe("Веќе потсетивте денес.");
  });

  it("an earlier day's reminder does not block today's", async () => {
    const e = await newEvent("Потсетник вчера");
    await admin.from("event_couple_reminders").insert({ event_id: e, reminded_by: "Х", reminded_at: new Date(Date.now() - 2 * 86_400_000).toISOString() });
    expect((await call(remindPost, e, "remind-couple")).status).toBe(200);
  });

  it("is refused once the numbers were sent", async () => {
    const e = await newEvent("Потсетник испратено");
    await admin.from("event_menu_submissions").insert({ event_id: e, sent_by: "Младенците", counts: {}, menu_titles: {}, total: 0 });
    const res = await call(remindPost, e, "remind-couple");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Бројките се веќе испратени.");
    const { data } = await admin.from("event_couple_reminders").select("id").eq("event_id", e);
    expect(data).toHaveLength(0);
  });
});

describe("POST menu-numbers", () => {
  async function eventWithMenus(name: string, date?: string) {
    const e = await newEvent(name, date);
    await admin.from("event_menu_templates").insert([{ event_id: e, menu_template_id: menuA }, { event_id: e, menu_template_id: menuB }]);
    return e;
  }

  it("staff gets 403", async () => {
    const e = await eventWithMenus("Бројки без токен");
    expect((await call(numbersPost, e, "menu-numbers", { token: null, body: { counts: { [menuA]: 1 } } })).status).toBe(403);
  });

  it("stores a venue submission, seen, unmentioned menus as 0", async () => {
    const e = await eventWithMenus("Бројки");
    const res = await call(numbersPost, e, "menu-numbers", { body: { counts: { [menuA]: 5 } } });
    expect(res.status).toBe(200);
    const { data } = await admin.from("event_menu_submissions").select("*").eq("event_id", e);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      source: "venue",
      sent_by: "Менаџер Промени",
      seen_by: "Менаџер Промени",
      unanswered: null,
      total: 5,
      counts: { [menuA]: 5, [menuB]: 0 },
      menu_titles: { [menuA]: "Класично", [menuB]: "Посно" },
    });
    expect(data![0].seen_at).not.toBeNull();
  });

  it("a duplicate submission landing within a few seconds (double-click, retried request) is not stored twice", async () => {
    const e = await eventWithMenus("Двоен клик");
    const first = await call(numbersPost, e, "menu-numbers", { body: { counts: { [menuA]: 5 } } });
    expect(first.status).toBe(200);
    const second = await call(numbersPost, e, "menu-numbers", { body: { counts: { [menuA]: 5 } } });
    expect(second.status).toBe(200);
    expect((await admin.from("event_menu_submissions").select("id").eq("event_id", e)).data).toHaveLength(1);

    // Different counts (a genuine resend with changed numbers) still lands.
    const third = await call(numbersPost, e, "menu-numbers", { body: { counts: { [menuA]: 6 } } });
    expect(third.status).toBe(200);
    expect((await admin.from("event_menu_submissions").select("id").eq("event_id", e)).data).toHaveLength(2);
  });

  it("rejects an unknown menu", async () => {
    const e = await eventWithMenus("Непознато");
    const res = await call(numbersPost, e, "menu-numbers", { body: { counts: { "00000000-0000-4000-8000-000000000000": 2 } } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Непознато мени.");
    expect((await admin.from("event_menu_submissions").select("id").eq("event_id", e)).data).toHaveLength(0);
  });

  it("rejects negative or fractional counts", async () => {
    const e = await eventWithMenus("Невалидно");
    expect((await call(numbersPost, e, "menu-numbers", { body: { counts: { [menuA]: -1 } } })).status).toBe(400);
    expect((await call(numbersPost, e, "menu-numbers", { body: { counts: { [menuA]: 1.5 } } })).status).toBe(400);
  });

  it("rejects an event without menus", async () => {
    const e = await newEvent("Без мени");
    const res = await call(numbersPost, e, "menu-numbers", { body: { counts: {} } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Настанот нема мени.");
  });

  it("refuses a past event", async () => {
    const e = await eventWithMenus("Минат", "2020-01-01");
    expect((await call(numbersPost, e, "menu-numbers", { body: { counts: { [menuA]: 1 } } })).status).toBe(409);
  });
});

describe("listEventsWithDetails unseenSections", () => {
  it("carries the unseen couple-change sections per event, none for a quiet event", async () => {
    const withChange = await newEvent("Со промена");
    const quiet = await newEvent("Тивок");
    await admin.from("events").update({ couple_first_login_at: "2020-01-01T00:00:00Z" }).in("id", [withChange, quiet]);
    await addChange(withChange, "guest_count", "guest_count");
    const staff = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await staff.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
    const list = await listEventsWithDetails(venueId, staff);
    expect(list.find((e) => e.id === withChange)!.unseenSections).toEqual(["guest_count"]);
    expect(list.find((e) => e.id === quiet)!.unseenSections).toEqual([]);
  });
});
