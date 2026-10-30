import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Security review item #2 (migration 0107 + /api/venue/settings): Поставки
// is owner-only (spec D4) past the page gate too — a non-owner manager or
// plain staff can change none of the venue's settings, through the routes
// or directly through their own browser session.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const EMAIL = `settings-route-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

let venueId: string;
let otherVenueId: string;
let userId: string;
let ownerToken: string;
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

import { PATCH as settingsRoute } from "@/app/api/venue/settings/route";
import { DELETE as removeLogoRoute } from "@/app/api/venue/settings/logo/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";
import { verifyLayoutLockPassword } from "@/lib/venue/floorplan";

const NO_PARAMS = { params: Promise.resolve({}) };

function patch(body: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return settingsRoute(new NextRequest("http://localhost/api/venue/settings", { method: "PATCH", headers, body: JSON.stringify(body) }), NO_PARAMS);
}

function logoRequest(token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return new NextRequest("http://localhost/api/venue/settings/logo", { method: "DELETE", headers });
}

async function venue(id = venueId) {
  const { data, error } = await admin.from("venues").select("name, address, phone, brand_color, logo_path").eq("id", id).single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Settings Route ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Settings Other ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });

  const ownerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Сопственик", p_password: "owner-pass-1", p_is_owner: true })).data as string;
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-1", p_is_owner: false })).data as string;
  ownerToken = (await createManagerElevation(venueId, ownerId, "Сопственик", true)).token;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер", false)).token;

  staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staffClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
}, 60_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

describe("PATCH /api/venue/settings", () => {
  it("lets the owner change the name, profile, colour and floor-plan lock password", async () => {
    expect((await patch({ field: "name", name: "  Нов Локал  " }, ownerToken)).status).toBe(200);
    expect((await patch({ field: "profile", address: "ул. Прва 1", phone: "+389 70 111 222" }, ownerToken)).status).toBe(200);
    expect((await patch({ field: "brand_color", color: "#0E9F95" }, ownerToken)).status).toBe(200);
    expect((await patch({ field: "layout_password", password: "4321" }, ownerToken)).status).toBe(200);

    expect(await venue()).toMatchObject({ name: "Нов Локал", address: "ул. Прва 1", phone: "+389 70 111 222", brand_color: "#0e9f95" });
    // Staff still unlock the floor plan with it (Распоред на маси).
    expect(await verifyLayoutLockPassword(venueId, "4321", staffClient)).toBe(true);
    // Only the caller's own venue changed.
    expect((await venue(otherVenueId)).name).toBe(`Settings Other ${stamp}`);
  });

  it("refuses a non-owner manager, plain staff and a made-up token", async () => {
    for (const token of [managerToken, undefined, "0".repeat(64)]) {
      const res = await patch({ field: "name", name: "Упад" }, token);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("Потребна е најава како сопственик.");
    }
    expect((await patch({ field: "layout_password", password: "0000" }, managerToken)).status).toBe(403);
    expect((await venue()).name).toBe("Нов Локал");
    expect(await verifyLayoutLockPassword(venueId, "4321", staffClient)).toBe(true);
  });

  it("explains a bad phone number or colour in Macedonian", async () => {
    const phone = await patch({ field: "profile", address: null, phone: "abc" }, ownerToken);
    expect(phone.status).toBe(400);
    expect((await phone.json()).error).toBe("Внесете важечки телефонски број.");
    const color = await patch({ field: "brand_color", color: "red" }, ownerToken);
    expect(color.status).toBe(400);
    expect((await color.json()).error).toBe("Изберете боја во облик #rrggbb.");
  });

  it("rejects an empty name", async () => {
    expect((await patch({ field: "name", name: "   " }, ownerToken)).status).toBe(400);
  });

  it("gates the shared login's own email/password behind owner elevation too", async () => {
    // Final review finding: these used to go straight from the browser to
    // Supabase Auth with no elevation check at all. Confirm non-owners are
    // still refused before letting the owner actually change anything.
    for (const token of [managerToken, undefined, "0".repeat(64)]) {
      expect((await patch({ field: "account_email", email: "upad@test.local" }, token)).status).toBe(403);
      expect((await patch({ field: "account_password", password: "upad12345" }, token)).status).toBe(403);
    }

    const newPassword = "owner-new-pass-1";
    expect((await patch({ field: "account_password", password: newPassword }, ownerToken)).status).toBe(200);

    const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await check.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })).error).not.toBeNull();
    expect((await check.auth.signInWithPassword({ email: EMAIL, password: newPassword })).error).toBeNull();

    // Revert: the mock `createServerSupabaseClient` signs in with the
    // original PASSWORD constant on every later call in this file.
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD });

    expect((await patch({ field: "account_email", email: "new-owner@test.local" }, ownerToken)).status).toBe(200);
  });

  it("explains a refused account change in Macedonian, never Supabase's English", async () => {
    // Reusing the current password is refused by Supabase Auth ("New
    // password should be different from the old password.").
    const res = await patch({ field: "account_password", password: PASSWORD }, ownerToken);
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toMatch(/[А-Яа-я]/);
    expect(error).not.toMatch(/[A-Za-z]{4,}/);
  });
});

describe("DELETE /api/venue/settings/logo", () => {
  // Uploading is two-step (signed URL + confirm): tests/supabase/venue_photo_routes.test.ts.
  it("removes the logo for the owner only", async () => {
    await admin.from("venues").update({ logo_path: `${venueId}/logo-1.png` }).eq("id", venueId);
    expect((await removeLogoRoute(logoRequest(managerToken), NO_PARAMS)).status).toBe(403);
    expect((await removeLogoRoute(logoRequest(), NO_PARAMS)).status).toBe(403);
    expect((await removeLogoRoute(logoRequest(ownerToken), NO_PARAMS)).status).toBe(200);
    expect((await venue()).logo_path).toBeNull();
  });
});

describe("0107 — staff cannot change the venue directly", () => {
  it("refuses a direct update of any venue column", async () => {
    const { error } = await staffClient.from("venues").update({ name: "Упад", brand_color: "#000000", logo_path: null }).eq("id", venueId);
    expect(error).not.toBeNull();
    expect((await venue()).name).toBe("Нов Локал");
  });

  it("refuses setting the floor-plan lock password through the RPC", async () => {
    const { error } = await staffClient.rpc("set_venue_layout_password", { p_venue_id: venueId, p_password: "0000" });
    expect(error).not.toBeNull();
    expect(await verifyLayoutLockPassword(venueId, "4321", staffClient)).toBe(true);
  });

  it("still lets staff read their venue", async () => {
    const { data, error } = await staffClient.from("venues").select("name").eq("id", venueId).single();
    expect(error).toBeNull();
    expect(data!.name).toBe("Нов Локал");
  });
});
