import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Every read query calls requireAdmin() first (defense in depth: Next can
// render a page without its layout). requireAdmin needs a Next request
// (cookies/headers), which a DB test doesn't have, so the guard is mocked
// here: it admits by default, and the last test makes it refuse to prove
// each query really goes through it. The guard itself is exercised against
// real Auth in tests/supabase/admin_guard.test.ts (checkAdmin).
const { requireAdmin } = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ adminUserId: "test-admin", requestId: null })),
}));
vi.mock("@/lib/admin/guard", () => ({ requireAdmin }));

import {
  getOverviewStats, listVenues, getVenueDetail, getEventDetail, listEvents, listPlans,
  getVenueOverrides, getEventOverrides, listMessages, getMaintenanceState, listAudit,
} from "@/lib/admin/queries";

const DAY = 86_400_000;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let staffId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Query Venue ${stamp}` }).select("id").single()).data!.id;
  staffId = (await admin.auth.admin.createUser({ email: `q-${stamp}@test.local`, password: "query-password-1", email_confirm: true })).data.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffId, venue_id: venueId });
  await admin.from("events").insert({ venue_id: venueId, couple_names: "Q & A", event_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), contact_email: "secret@example.com" });
  await admin.from("reservations").insert({ venue_id: venueId, room_id: (await admin.from("rooms").insert({ venue_id: venueId, name: "R" }).select("id").single()).data!.id, guest_name: "Тајно Име", phone: "070111", date: "2028-07-01", start_time: "12:00", party_size: 2 });
});
afterAll(async () => {
  await admin.auth.admin.deleteUser(staffId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("admin read models", () => {
  it("lists and finds venues with counts", async () => {
    const rows = await listVenues({ q: `Query Venue ${stamp}` });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ staffCount: 1, eventCount: 1, planName: "Стандарден", blockedAt: null });
  });

  it("returns venue detail with staff but no private data", async () => {
    const d = await getVenueDetail(venueId);
    expect(d!.staff[0]).toMatchObject({ email: `q-${stamp}@test.local`, mfa: false });
    const raw = JSON.stringify(d);
    expect(raw).not.toContain("secret@example.com");
    expect(raw).not.toContain("Тајно Име");
    expect(raw).not.toContain("070111");
  });

  it("lists events across venues without contact details", async () => {
    const rows = await listEvents({ venueId });
    expect(rows[0]).toMatchObject({ coupleNames: "Q & A", venueName: `Query Venue ${stamp}` });
    expect(JSON.stringify(rows)).not.toContain("secret@example.com");
  });

  it("counts overview numbers and plans", async () => {
    const s = await getOverviewStats();
    expect(s.venues).toBeGreaterThan(0);
    expect(s.upcomingEvents).toBeGreaterThan(0);
    expect(s.signupsByWeek).toHaveLength(8);
    const plans = await listPlans();
    expect(plans.find((p) => p.isDefault)!.venueCount).toBeGreaterThan(0);
  });

  it("buckets a venue created ~1 day ago into the last signup week", async () => {
    // The last bucket (index 7) must be [now-7d, now) — a venue created
    // yesterday belongs there, not in a bucket that always reads 0.
    const recent = (
      await admin
        .from("venues")
        .insert({ name: `Recent Venue ${stamp}`, created_at: new Date(Date.now() - 1 * DAY).toISOString() })
        .select("id")
        .single()
    ).data!.id;
    try {
      const s = await getOverviewStats();
      const lastBucket = s.signupsByWeek[7];
      expect(lastBucket.count).toBeGreaterThanOrEqual(1);
      expect(lastBucket.week).toBe(new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10));
    } finally {
      await admin.from("venues").delete().eq("id", recent);
    }
  });

  it("treats a non-UUID id as not found instead of erroring", async () => {
    expect(await getVenueDetail("not-a-uuid")).toBeNull();
    expect(await getEventDetail("not-a-uuid")).toBeNull();
  });

  it("refuses every query when the admin guard refuses", async () => {
    const refusal = new Error("Admin access required.");
    const queries: (() => Promise<unknown>)[] = [
      () => getOverviewStats(), () => listVenues({}), () => getVenueDetail(venueId), () => listEvents({}),
      () => getEventDetail(venueId), () => listPlans(), () => getVenueOverrides(venueId), () => getEventOverrides(venueId),
      () => listMessages({}), () => getMaintenanceState(), () => listAudit({}),
    ];
    for (const q of queries) {
      requireAdmin.mockRejectedValueOnce(refusal);
      await expect(q()).rejects.toBe(refusal);
    }
  });
});
