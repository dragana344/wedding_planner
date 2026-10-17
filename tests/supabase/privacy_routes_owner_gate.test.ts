import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let userId: string;
let ownerToken: string;
let managerToken: string;
const EMAIL = `privacy-owner-gate-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

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

import { GET as exportRoute } from "@/app/api/venue/privacy/export/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Privacy Gate Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  const ownerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Власник", p_password: "owner-pass-123", p_is_owner: true })).data as string;
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-123", p_is_owner: false })).data as string;
  ownerToken = (await createManagerElevation(venueId, ownerId, "Власник", true)).token;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер", false)).token;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

function req(token?: string) {
  const headers = new Headers();
  if (token) headers.set(MANAGER_TOKEN_HEADER, token);
  return new NextRequest("http://localhost/api/venue/privacy/export", { headers });
}

describe("GET /api/venue/privacy/export — owner gate", () => {
  it("succeeds for the owner's token", async () => {
    const res = await exportRoute(req(ownerToken));
    expect(res.status).toBe(200);
  });

  it("refuses a non-owner manager's token", async () => {
    const res = await exportRoute(req(managerToken));
    expect(res.status).toBe(403);
  });

  it("refuses with no token at all", async () => {
    const res = await exportRoute(req());
    expect(res.status).toBe(403);
  });
});
