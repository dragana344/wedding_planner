import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let userId: string;
let noticeManagerId: string;
const EMAIL = `elevation-route-${stamp}@test.local`;
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

import { POST as elevateRoute } from "@/app/api/venue/managers/elevate/route";
import { POST as deauthorizeRoute } from "@/app/api/venue/managers/deauthorize/route";
import { POST as dismissNoticeRoute } from "@/app/api/venue/managers/password-reset-notice/dismiss/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/venue/managers/elevate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({}) as never };

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Elevation Route Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Тест Менаџер", p_password: "manager-pass-1", p_is_owner: true });
  noticeManagerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Тест Менаџер со известување", p_password: "manager-pass-2", p_is_owner: false })).data as string;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("POST /api/venue/managers/elevate", () => {
  it("elevates with the correct name and password", async () => {
    const res = await elevateRoute(req({ name: "Тест Менаџер", password: "manager-pass-1" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.managerName).toBe("Тест Менаџер");
    expect(typeof body.token).toBe("string");
  });

  it("refuses a wrong password with a generic message", async () => {
    const res = await elevateRoute(req({ name: "Тест Менаџер", password: "wrong" }), ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("rejects a malformed body", async () => {
    const res = await elevateRoute(req({ name: "" }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/venue/managers/deauthorize", () => {
  it("revokes a token so it can no longer validate", async () => {
    const elevated = await elevateRoute(req({ name: "Тест Менаџер", password: "manager-pass-1" }), ctx);
    const { token } = await elevated.json();

    const deauth = await deauthorizeRoute(
      new NextRequest("http://localhost/api/venue/managers/deauthorize", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }),
      }),
      ctx
    );
    expect(deauth.status).toBe(200);

    const { validateManagerElevation } = await import("@/lib/venue/manager-elevation");
    expect(await validateManagerElevation(token, venueId)).toBeNull();
  });
});

describe("POST /api/venue/managers/password-reset-notice/dismiss (security review #4)", () => {
  it("surfaces a pending admin-reset notice on elevation, then clears it for good once dismissed", async () => {
    await admin.from("venue_managers").update({ password_reset_notice_at: new Date().toISOString() }).eq("id", noticeManagerId);

    const elevated = await elevateRoute(req({ name: "Тест Менаџер со известување", password: "manager-pass-2" }), ctx);
    const body = await elevated.json();
    expect(body.passwordResetNoticeAt).toBeTruthy();

    const dismiss = await dismissNoticeRoute(
      new NextRequest("http://localhost/api/venue/managers/password-reset-notice/dismiss", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: body.token }),
      }),
      ctx
    );
    expect(dismiss.status).toBe(200);

    const reElevated = await elevateRoute(req({ name: "Тест Менаџер со известување", password: "manager-pass-2" }), ctx);
    expect((await reElevated.json()).passwordResetNoticeAt).toBeNull();
  });

  it("401s on a token that doesn't belong to this venue's session rather than silently no-op'ing", async () => {
    const res = await dismissNoticeRoute(
      new NextRequest("http://localhost/api/venue/managers/password-reset-notice/dismiss", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "not-a-real-token" }),
      }),
      ctx
    );
    expect(res.status).toBe(401);
  });
});
