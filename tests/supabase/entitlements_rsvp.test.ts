import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as rsvp } from "@/app/api/invite/[slug]/rsvp/route";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let planId: string;
let venueId: string;
const slug = `lim${Date.now()}`.slice(0, 20);

function post(fullName: string) {
  return rsvp(new NextRequest(`http://localhost/api/invite/${slug}/rsvp`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `rsvp-${Math.random()}` },
    body: JSON.stringify({ full_name: fullName, attending: true }),
  }), { params: { slug } });
}

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `RSVP limit ${Date.now()}` }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "invitation", enabled: true },
    { plan_id: planId, feature_key: "max_guests", enabled: true, limit_value: 1 },
    // A feature_key with no row at all resolves disabled with limit 0 (Task
    // 2.2's controller ruling, tests/supabase/entitlements_resolution.test.ts),
    // not "unlimited" — so max_active_events must be explicitly enabled here,
    // or migration 0049's events trigger would refuse the very first event
    // this fixture creates (0 active events already >= a limit of 0).
    { plan_id: planId, feature_key: "max_active_events", enabled: true },
  ]);
  venueId = (await admin.from("venues").insert({ name: "RSVP Limit Venue", plan_id: planId }).select("id").single()).data!.id;
  const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Lim & It", event_date: "2028-04-01" }).select("id").single()).data!.id;
  await admin.from("event_invitations").insert({ event_id: eventId, template_id: "romantic-floral", public_slug: slug });
  await admin.from("event_guests").insert({ event_id: eventId, full_name: "Ана" });
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("RSVP under the guest limit (Review Focus)", () => {
  it("still updates a listed guest when the list is full", async () => {
    expect((await post("Ана")).status).toBe(200);
  });
  it("refuses a new guest over the limit with the limit message", async () => {
    const res = await post("Нов Гостин");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Достигнат е лимитот од 1 гости за овој настан.");
  });
});
