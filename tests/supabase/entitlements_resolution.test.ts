import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let planId: string;
let venueId: string;
let eventId: string;

async function resolved(venue: string, event: string | null) {
  const { data, error } = await admin.rpc("effective_features", { p_venue_id: venue, p_event_id: event });
  if (error) throw error;
  return Object.fromEntries((data as { feature_key: string; enabled: boolean; limit_value: number | null }[]).map((r) => [r.feature_key, { enabled: r.enabled, limit: r.limit_value }]));
}

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `Basic ${Date.now()}`, sort_order: 10 }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "invitation", enabled: true },
    { plan_id: planId, feature_key: "seating", enabled: false },
    { plan_id: planId, feature_key: "max_guests", enabled: true, limit_value: 150 },
    { plan_id: planId, feature_key: "reservations", enabled: false },
    // A feature_key with no row at all resolves disabled with limit 0 (the
    // very next test below), so max_active_events must be explicitly
    // enabled here or migration 0049's events trigger refuses this
    // fixture's own event insert on line below (0 active events already
    // >= a limit of 0).
    { plan_id: planId, feature_key: "max_active_events", enabled: true },
  ]);
  venueId = (await admin.from("venues").insert({ name: "Entitlements Venue", plan_id: planId }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Ent & Test", event_date: "2028-02-01" }).select("id").single()).data!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("effective_features (spec §4.3)", () => {
  it("takes the plan's values, and locks anything the plan does not list", async () => {
    const f = await resolved(venueId, eventId);
    expect(f.invitation).toEqual({ enabled: true, limit: null });
    // Not `limit: null`: a disabled feature's limit is always 0, never
    // "unlimited" (controller ruling) — even for a switch-kind feature like
    // `seating`, where the plan's own row happens to leave limit_value unset.
    expect(f.seating).toEqual({ enabled: false, limit: 0 });
    expect(f.max_guests).toEqual({ enabled: true, limit: 150 });
    expect(f.budget).toEqual({ enabled: false, limit: 0 });
    expect(Object.keys(f)).toHaveLength(27);
  });

  it("a disabled limit feature resolves limit 0, even with no explicit limit_value (controller ruling)", async () => {
    await admin.from("plan_features").insert({ plan_id: planId, feature_key: "max_rooms", enabled: false, limit_value: null });
    expect((await resolved(venueId, null)).max_rooms).toEqual({ enabled: false, limit: 0 });
  });

  it("refuses an event that doesn't belong to the given venue, even for service_role", async () => {
    // A mismatched (venue, event) pair is always wrong: either an
    // authorization bypass attempt from a non-service caller, or a caller
    // bug from a service-role caller. Both fail the same way (42501), since
    // no correct call site can ever legitimately hit this.
    const { data: otherVenue } = await admin.from("venues").insert({ name: "Entitlements Cross Venue" }).select("id").single();
    const { data: otherEvent } = await admin
      .from("events")
      .insert({ venue_id: otherVenue!.id, couple_names: "Cross & Test", event_date: "2028-03-01" })
      .select("id")
      .single();
    const { error } = await admin.rpc("effective_features", { p_venue_id: venueId, p_event_id: otherEvent!.id });
    expect(error?.code).toBe("42501");
    await admin.from("venues").delete().eq("id", otherVenue!.id);
  });

  it("applies a venue override over the plan", async () => {
    await admin.from("venue_feature_overrides").insert({ venue_id: venueId, feature_key: "reservations", enabled: true, note: "договор" });
    expect((await resolved(venueId, null)).reservations.enabled).toBe(true);
  });

  it("applies an event override over the venue and plan, including a changed limit", async () => {
    // Two separate inserts, not one bulk array: PostgREST's bulk insert
    // requires every object in the array to share the same keys (PGRST102),
    // and these two rows don't (one sets enabled+note, the other limit_override+limit_value).
    await admin.from("event_feature_overrides").insert({ event_id: eventId, feature_key: "seating", enabled: true, note: "доплата" });
    await admin.from("event_feature_overrides").insert({ event_id: eventId, feature_key: "max_guests", limit_override: true, limit_value: 400 });
    const f = await resolved(venueId, eventId);
    expect(f.seating.enabled).toBe(true);
    expect(f.max_guests).toEqual({ enabled: true, limit: 400 });
  });

  it("an event override with limit_override and null limit means unlimited", async () => {
    await admin.from("event_feature_overrides").update({ limit_value: null }).eq("event_id", eventId).eq("feature_key", "max_guests");
    expect((await resolved(venueId, eventId)).max_guests.limit).toBeNull();
  });

  it("without an event, event-scope features resolve from venue override → plan", async () => {
    expect((await resolved(venueId, null)).seating.enabled).toBe(false);
  });

  it("gives existing and new venues the default plan with everything unlocked", async () => {
    const { data: def } = await admin.from("plans").select("id").eq("is_default", true).single();
    const { data: fresh } = await admin.rpc("provision_venue", { p_user_id: (await admin.auth.admin.createUser({ email: `plan-${Date.now()}@test.local`, password: "plan-password-1", email_confirm: true })).data.user!.id, p_venue_name: "Fresh Venue" });
    const { data: v } = await admin.from("venues").select("plan_id").eq("id", fresh).single();
    expect(v!.plan_id).toBe(def!.id);
    const f = await resolved(fresh as string, null);
    for (const [k, r] of Object.entries(f)) expect(r.enabled, k).toBe(true);
    expect(f.max_rooms.limit).toBeNull();
    expect(f.storage_gb.limit).toBe(5);
    expect(f.photo_retention_days.limit).toBe(15);
  });

  it("refuses an unknown feature key", async () => {
    const { error } = await admin.from("plan_features").insert({ plan_id: planId, feature_key: "teleport", enabled: true });
    expect(error?.code).toBe("23514");
  });

  it("allows only one default plan", async () => {
    const { error } = await admin.from("plans").insert({ name: `Second default ${Date.now()}`, is_default: true });
    expect(error?.code).toBe("23505");
  });
});
