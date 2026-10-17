import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const EMAIL = `change-pass-route-${stamp}@test.local`;
const PASSWORD = "staff-password-123";
let venueId: string;
let userId: string;
let managerId: string;
let managerToken: string;

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

import { POST as changePasswordRoute } from "@/app/api/venue/managers/change-password/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

function req(token: string, body: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json", [MANAGER_TOKEN_HEADER]: token };
  return new NextRequest("http://localhost/api/venue/managers/change-password", { method: "POST", headers, body: JSON.stringify(body) });
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Change Pass Route Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер Рут", p_password: "original-pass-123", p_is_owner: false })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер Рут", false)).token;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("POST /api/venue/managers/change-password", () => {
  it("refuses with no current password (schema)", async () => {
    const res = await changePasswordRoute(req(managerToken, { newPassword: "new-password-1" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it("refuses a wrong current password and leaves the password unchanged (final review finding: this used to need no current password at all)", async () => {
    const res = await changePasswordRoute(req(managerToken, { currentPassword: "not-the-real-one", newPassword: "new-password-1" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Тековната лозинка не е точна.");
    const verify = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Менаџер Рут", p_password: "original-pass-123" });
    expect(verify.data![0].error_code).toBeNull();
  });

  it("changes the password when the current one is correct", async () => {
    const res = await changePasswordRoute(req(managerToken, { currentPassword: "original-pass-123", newPassword: "freshly-changed-1" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const verify = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Менаџер Рут", p_password: "freshly-changed-1" });
    expect(verify.data![0].error_code).toBeNull();
  });
});
