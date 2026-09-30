// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as createCoOrganizerRoute } from "@/app/api/couple/co-organizers/route";
import { POST as startPhoto } from "@/app/api/e/[token]/photos/route";
import { POST as startVideo } from "@/app/api/e/[token]/greetings/video/route";
import { POST as postGreeting } from "@/app/api/e/[token]/greetings/route";
import { createCoOrganizer } from "@/lib/couple/co-organizers";
import { runDueReminders } from "@/lib/couple/reminders";
import { assertQuotaFor, getOrCreateAlbumToken, getStorageUsage, QUOTA_FULL_ERROR } from "@/lib/media/album";

// Session 1 follow-ups: plan entitlements on the routes and jobs Sessions 2–4
// added (co-organizer limit, admin unlock, reminders cron, album quota and
// the guests' album routes). Every custom plan carries max_active_events
// (enabled, unlimited) or its events would be refused (disabled → limit 0).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const LOCKED = "Оваа функција не е вклучена во вашиот пакет.";
const stamp = Date.now();
const planIds: string[] = [];
const venueIds: string[] = [];

type Feature = { feature_key: string; enabled: boolean; limit_value?: number | null };

/** A venue on its own plan with these features (everything else off), and one event. */
async function fixture(name: string, features: Feature[], eventDate = "2029-05-01"): Promise<{ venueId: string; eventId: string }> {
  const planId = (await admin.from("plans").insert({ name: `${name} ${stamp}` }).select("id").single()).data!.id as string;
  planIds.push(planId);
  const { error } = await admin
    .from("plan_features")
    .insert([{ feature_key: "max_active_events", enabled: true, limit_value: null }, ...features].map((f) => ({ plan_id: planId, ...f })));
  if (error) throw error;
  const venueId = (await admin.from("venues").insert({ name: `${name} Venue`, plan_id: planId }).select("id").single()).data!.id as string;
  venueIds.push(venueId);
  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: `${name} Couple`, event_date: eventDate })
    .select("id")
    .single();
  if (eventError) throw eventError;
  return { venueId, eventId: event!.id };
}

afterAll(async () => {
  if (venueIds.length) await admin.from("venues").delete().in("id", venueIds);
  if (planIds.length) await admin.from("plans").delete().in("id", planIds);
});

function coupleReq(eventId: string, body: unknown) {
  return new NextRequest("http://localhost/api/couple/co-organizers", {
    method: "POST",
    headers: { "x-couple-event-id": eventId, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function guestReq(token: string, body: unknown, ip: string) {
  return new NextRequest(`http://localhost/api/e/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

describe("co-organizer limit (0083)", () => {
  let eventId: string;
  beforeAll(async () => {
    ({ eventId } = await fixture("CoOrg One", [{ feature_key: "co_organizers", enabled: true, limit_value: 1 }]));
  });

  it("allows up to the limit, then refuses with the Macedonian message", async () => {
    await createCoOrganizer(eventId, { side: "bride", username: `coorg-a-${stamp}`, password: "long-enough-1" });
    await expect(createCoOrganizer(eventId, { side: "groom", username: `coorg-b-${stamp}`, password: "long-enough-2" })).rejects.toThrow(
      "Достигнат е лимитот од 1 дополнителни организатори.",
    );
  });

  it("refuses a direct insert too (trigger, every path)", async () => {
    const { error } = await admin
      .from("event_co_organizers")
      .insert({ event_id: eventId, side: "groom", username: `coorg-c-${stamp}`, password_hash: "x" });
    expect(error?.code).toBe("P0001");
    expect(error?.message).toBe("Достигнат е лимитот од 1 дополнителни организатори.");
  });

  it("shows the limit message to the couple through the route", async () => {
    const res = await createCoOrganizerRoute(coupleReq(eventId, { side: "groom", username: `coorg-d-${stamp}`, password: "long-enough-3" }), {
      params: {},
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Достигнат е лимитот од 1 дополнителни организатори." });
  });

  it("the route answers 403 when co_organizers is off for the package", async () => {
    const { eventId: lockedEvent } = await fixture("CoOrg Off", []);
    const res = await createCoOrganizerRoute(
      coupleReq(lockedEvent, { side: "bride", username: `coorg-e-${stamp}`, password: "long-enough-4" }),
      { params: {} },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: LOCKED });
  });

  it("an unlimited limit (null) skips the check", async () => {
    const { eventId: open } = await fixture("CoOrg Open", [{ feature_key: "co_organizers", enabled: true, limit_value: null }]);
    await createCoOrganizer(open, { side: "bride", username: `coorg-f-${stamp}`, password: "long-enough-5" });
    await createCoOrganizer(open, { side: "groom", username: `coorg-g-${stamp}`, password: "long-enough-6" });
    const { count } = await admin.from("event_co_organizers").select("*", { count: "exact", head: true }).eq("event_id", open);
    expect(count).toBe(2);
  });
});

describe("admin unlock covers co-organizers (0084)", () => {
  it("clears the couple's and every co-organizer's lockout for the event", async () => {
    const { eventId } = await fixture("Unlock", [{ feature_key: "co_organizers", enabled: true, limit_value: null }]);
    await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `unlock-main-${stamp}`, p_password: "long-enough-7" });
    const co = await createCoOrganizer(eventId, { side: "bride", username: `unlock-co-${stamp}`, password: "long-enough-8" });
    const until = new Date(Date.now() + 3600_000).toISOString();
    await admin.from("event_credentials").update({ failed_attempts: 5, locked_until: until }).eq("event_id", eventId);
    await admin.from("event_co_organizers").update({ failed_attempts: 5, locked_until: until }).eq("id", co.id);

    expect((await admin.rpc("admin_unlock_couple_login", { p_event_id: eventId })).error).toBeNull();

    const main = await admin.from("event_credentials").select("failed_attempts, locked_until").eq("event_id", eventId).single();
    const second = await admin.from("event_co_organizers").select("failed_attempts, locked_until").eq("id", co.id).single();
    expect(main.data).toEqual({ failed_attempts: 0, locked_until: null });
    expect(second.data).toEqual({ failed_attempts: 0, locked_until: null });
  });
});

describe("reminders cron respects the package", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("skips an event without `reminders`: nothing sent, nothing marked", async () => {
    const sent: { to: string[] }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).startsWith("https://api.resend.com/")) {
        sent.push(JSON.parse(String(init!.body)));
        return new Response("{}", { status: 200 });
      }
      return realFetch(input, init);
    });
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Каде Сум <noreply@example.mk>";

    // Far-off date: the cron handles every due event in the shared test database.
    const { eventId } = await fixture("No Reminders", [{ feature_key: "max_guests", enabled: true, limit_value: null }], "2094-06-20");
    await admin.from("event_guests").insert({ event_id: eventId, full_name: "Да", email: "noreminder@example.mk", rsvp_status: "confirmed" });
    await admin.from("event_reminders").insert({ event_id: eventId, send_at: "2094-06-05T08:00:00Z", status: "scheduled" });

    const results = await runDueReminders(new Date("2094-06-05T09:00:00Z"), "https://kadesum.mk");
    expect(results.find((r) => r.eventId === eventId)).toBeUndefined();
    expect(sent.filter((m) => m.to[0] === "noreminder@example.mk")).toEqual([]);
    const reminder = await admin.from("event_reminders").select("status, sent_at").eq("event_id", eventId).single();
    expect(reminder.data).toEqual({ status: "scheduled", sent_at: null });
    const guest = await admin.from("event_guests").select("reminder_sent_at").eq("event_id", eventId).single();
    expect(guest.data!.reminder_sent_at).toBeNull();
  });
});

describe("album quota from the plan (storage_gb)", () => {
  it("refuses any upload at a 0 GB limit, through the lib and the guest route", async () => {
    const { eventId } = await fixture("Tiny Storage", [
      { feature_key: "photo_album", enabled: true },
      { feature_key: "storage_gb", enabled: true, limit_value: 0 },
    ]);
    expect(await getStorageUsage(eventId)).toEqual({ limitBytes: 0, photoBytes: 0, videoBytes: 0 });
    await expect(assertQuotaFor(eventId, 1)).rejects.toThrow(QUOTA_FULL_ERROR);

    const token = await getOrCreateAlbumToken(eventId);
    const res = await startPhoto(guestReq(token, { bytes: 1000 }, "203.0.113.91"), { params: { token } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: QUOTA_FULL_ERROR });
  });

  it("treats a null storage_gb as unlimited", async () => {
    const { eventId } = await fixture("Open Storage", [{ feature_key: "storage_gb", enabled: true, limit_value: null }]);
    expect((await getStorageUsage(eventId)).limitBytes).toBeNull();
    await expect(assertQuotaFor(eventId, 500 * 1024 ** 3)).resolves.toBeUndefined();
  });
});

describe("guest album routes on a plan without the album features", () => {
  it("answer 403 with the locked message", async () => {
    const { eventId } = await fixture("No Album", [{ feature_key: "storage_gb", enabled: true, limit_value: null }]);
    const token = await getOrCreateAlbumToken(eventId);
    for (const [handler, body] of [
      [startPhoto, { bytes: 10 }],
      [startVideo, { bytes: 10 }],
      [postGreeting, { first_name: "А", last_name: "Б", message: "Честито" }],
    ] as const) {
      const res = await handler(guestReq(token, body, "203.0.113.92"), { params: { token } });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: LOCKED });
    }
    const { count } = await admin.from("event_greetings").select("*", { count: "exact", head: true }).eq("event_id", eventId);
    expect(count).toBe(0);
  });
});
