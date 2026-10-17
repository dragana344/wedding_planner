import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const PASSWORD = "staff-password-123";

// Reassignable per-test session, same pattern as tests/supabase/privacy.test.ts
// — lets different tests act as different signed-in staff users without
// re-mocking the module.
const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => session.client }));

import { GET as reportsRoute } from "@/app/api/venue/reports/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

async function signedInClient(email: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: PASSWORD });
  return c;
}

let venueId: string;
let userId: string;
let managerToken: string;
const EMAIL = `reports-route-${stamp}@test.local`;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Reports Route Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-123", p_is_owner: false })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер", false)).token;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

function req(token?: string) {
  const headers = new Headers();
  if (token) headers.set(MANAGER_TOKEN_HEADER, token);
  return new NextRequest("http://localhost/api/venue/reports", { headers });
}

describe("GET /api/venue/reports", () => {
  it("returns report data for an elevated manager", async () => {
    session.client = await signedInClient(EMAIL);
    const res = await reportsRoute(req(managerToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toBeDefined();
  });

  it("refuses with no manager token", async () => {
    session.client = await signedInClient(EMAIL);
    const res = await reportsRoute(req());
    expect(res.status).toBe(403);
  });
});

describe("GET /api/venue/reports — plan without the reports feature", () => {
  // Final review finding (Important): the route must refuse real data for a
  // venue whose plan excludes Reports, same as the page's own
  // features.reports.enabled check — an elevated manager must not be able
  // to bypass the plan lock by calling the route directly.
  let lockedVenueId: string;
  let lockedUserId: string;
  let lockedPlanId: string;
  let lockedManagerToken: string;
  const LOCKED_EMAIL = `reports-locked-${stamp}@test.local`;

  beforeAll(async () => {
    lockedPlanId = (await admin.from("plans").insert({ name: `Reports Locked ${stamp}` }).select("id").single()).data!.id;
    // No plan_features row for "reports" at all — resolves disabled, same
    // pattern tests/supabase/entitlements_server.test.ts's fixture uses.
    lockedVenueId = (await admin.from("venues").insert({ name: `Reports Locked Venue ${stamp}`, plan_id: lockedPlanId }).select("id").single()).data!.id;
    const { data, error } = await admin.auth.admin.createUser({ email: LOCKED_EMAIL, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    lockedUserId = data.user!.id;
    await admin.from("venue_staff").insert({ user_id: lockedUserId, venue_id: lockedVenueId });
    const lockedManagerId = (await admin.rpc("create_venue_manager", { p_venue_id: lockedVenueId, p_name: "Менаџер", p_password: "manager-pass-123", p_is_owner: false })).data as string;
    lockedManagerToken = (await createManagerElevation(lockedVenueId, lockedManagerId, "Менаџер", false)).token;
  });
  afterAll(async () => {
    if (lockedUserId) await admin.auth.admin.deleteUser(lockedUserId);
    await admin.from("venues").delete().eq("id", lockedVenueId);
    await admin.from("plans").delete().eq("id", lockedPlanId);
  });

  it("refuses an elevated manager at a venue whose plan excludes reports", async () => {
    session.client = await signedInClient(LOCKED_EMAIL);
    const res = await reportsRoute(req(lockedManagerToken));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
