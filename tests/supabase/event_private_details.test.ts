import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 0117 + /api/venue/events/private: the couple's contacts and each event's
// money are manager/owner only — plain staff can't read them from the table,
// pages send events without them, and the gated route returns them only for
// the caller's own venue.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const EMAIL = `event-private-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

let venueId: string;
let otherVenueId: string;
let userId: string;
let eventId: string;
let otherEventId: string;
let managerToken: string;
let staffClient: SupabaseClient;

vi.mock("@/lib/supabase/server", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  return {
    createServerSupabaseClient: async () => {
      const c = create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      return c;
    },
  };
});

import { GET as privateRoute } from "@/app/api/venue/events/private/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";
import { listEventsWithDetails } from "@/lib/venue/events";

function call(token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return privateRoute(new NextRequest("http://localhost/api/venue/events/private", { headers }));
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Private ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Private Other ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  eventId = (await admin.from("events").insert({
    venue_id: venueId, couple_names: "Ана и Марко", event_date: "2027-07-01",
    contact_email: "ana@example.mk", contact_phone: "070 111 222", total_price: 300000, deposit_paid: 50000,
  }).select("id").single()).data!.id;
  otherEventId = (await admin.from("events").insert({
    venue_id: otherVenueId, couple_names: "Туѓ пар", event_date: "2027-07-01", contact_email: "tug@example.mk", total_price: 1,
  }).select("id").single()).data!.id;

  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-1", p_is_owner: true })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер", true)).token;

  staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staffClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
}, 60_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

describe("0117 — plain staff can't read contacts or money", () => {
  it.each(["contact_email", "contact_email_2", "contact_phone", "total_price", "deposit_paid"])("refuses %s", async (column) => {
    const { error } = await staffClient.from("events").select(`id, ${column}`).eq("id", eventId);
    expect(error?.code).toBe("42501");
  });

  it("refuses select *", async () => {
    const { error } = await staffClient.from("events").select("*").eq("id", eventId);
    expect(error?.code).toBe("42501");
  });

  it("still reads everything else, and the events list works without the private fields", async () => {
    const { data, error } = await staffClient.from("events").select("id, couple_names, event_date, status, seating_unseen_at").eq("id", eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const [event] = await listEventsWithDetails(venueId, staffClient);
    expect(event).toMatchObject({ couple_names: "Ана и Марко", contact_email: null, contact_phone: null, total_price: null, deposit_paid: null });
  });
});

describe("GET /api/venue/events/private", () => {
  it("refuses plain staff and a made-up token", async () => {
    expect((await call()).status).toBe(403);
    expect((await call("0".repeat(64))).status).toBe(403);
  });

  it("gives a manager their own venue's contacts and money only", async () => {
    const res = await call(managerToken);
    expect(res.status).toBe(200);
    const { events } = await res.json();
    expect(events).toEqual([
      { id: eventId, contact_email: "ana@example.mk", contact_email_2: null, contact_phone: "070 111 222", total_price: 300000, deposit_paid: 50000 },
    ]);
    expect(events.map((e: { id: string }) => e.id)).not.toContain(otherEventId);
  });
});
