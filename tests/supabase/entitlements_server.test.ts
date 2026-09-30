import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getEventFeatures, getVenueFeatures, eventHasFeature } from "@/lib/entitlements/server";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let planId: string;
let venueId: string;
let eventId: string;

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `Server ${Date.now()}` }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "budget", enabled: true },
    // max_active_events must be explicitly enabled, or migration 0049's events
    // trigger refuses this fixture's own event insert below (a feature_key
    // with no plan row resolves disabled with limit 0, so 0 active events
    // already >= that implicit limit of 0 — see entitlements_resolution.test.ts).
    { plan_id: planId, feature_key: "max_active_events", enabled: true },
  ]);
  venueId = (await admin.from("venues").insert({ name: "Server Venue", plan_id: planId }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "S & V", event_date: "2028-05-01" }).select("id").single()).data!.id;
});
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("server feature reads", () => {
  it("returns a complete map", async () => {
    const f = await getEventFeatures(eventId);
    expect(Object.keys(f)).toHaveLength(26);
    expect(f.budget.enabled).toBe(true);
    expect(f.seating.enabled).toBe(false);
    expect((await getVenueFeatures(venueId)).reservations.enabled).toBe(false);
  });
  it("answers single checks", async () => {
    expect(await eventHasFeature(eventId, "budget")).toBe(true);
    expect(await eventHasFeature(eventId, "notes")).toBe(false);
  });
});
