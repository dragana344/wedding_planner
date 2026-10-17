import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listManagers, addManager, removeManager } from "@/lib/venue/managers";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const ROUTES_EMAIL = `managers-routes-${stamp}@test.local`;
const ROUTES_PASSWORD = "staff-password-123";

vi.mock("@/lib/supabase/server", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  return {
    createServerSupabaseClient: async () => {
      const c = create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      await c.auth.signInWithPassword({ email: ROUTES_EMAIL, password: ROUTES_PASSWORD });
      return c;
    },
  };
});

let venueId: string;
let ownerId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Managers Lib Venue ${stamp}` }).select("id").single()).data!.id;
  ownerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Власник", p_password: "owner-pass-123", p_is_owner: true })).data as string;
});
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("lib/venue/managers", () => {
  it("lists managers with the owner flagged", async () => {
    const managers = await listManagers(venueId);
    expect(managers).toEqual([expect.objectContaining({ id: ownerId, name: "Власник", isOwner: true })]);
  });

  it("adds a non-owner manager", async () => {
    const { id } = await addManager(venueId, "Нов Менаџер", "new-manager-pass-1");
    const managers = await listManagers(venueId);
    expect(managers).toContainEqual(expect.objectContaining({ id, name: "Нов Менаџер", isOwner: false }));
  });

  it("trims the manager's name before storing it, so trailing whitespace can't dodge the uniqueness check (final review finding)", async () => {
    const { id } = await addManager(venueId, "  Разграничен  ", "trim-pass-1");
    const managers = await listManagers(venueId);
    expect(managers.find((m) => m.id === id)?.name).toBe("Разграничен");
    await expect(addManager(venueId, "Разграничен", "trim-pass-2")).rejects.toThrow();
  });

  it("removes a non-owner manager", async () => {
    const { id } = await addManager(venueId, "За Бришење", "delete-me-pass-1");
    await removeManager(venueId, id);
    const managers = await listManagers(venueId);
    expect(managers.find((m) => m.id === id)).toBeUndefined();
  });

  it("refuses to remove the owner", async () => {
    await expect(removeManager(venueId, ownerId)).rejects.toThrow("Не можете да се отстраните себеси.");
    const managers = await listManagers(venueId);
    expect(managers.find((m) => m.id === ownerId)).toBeDefined();
  });

  it("refuses a non-existent manager id with a distinct message from the owner case (final review finding)", async () => {
    await expect(removeManager(venueId, "00000000-0000-0000-0000-000000000000")).rejects.toThrow("Менаџерот не е пронајден.");
  });
});

describe("owner-only manager routes", () => {
  let routesVenueId: string;
  let routesUserId: string;
  let routesOwnerId: string;
  let routesManagerId: string;
  let ownerToken: string;
  let managerToken: string;

  beforeAll(async () => {
    const { createManagerElevation } = await import("@/lib/venue/manager-elevation");
    routesVenueId = (await admin.from("venues").insert({ name: `Managers Route Venue ${stamp}` }).select("id").single()).data!.id;
    const { data, error } = await admin.auth.admin.createUser({ email: ROUTES_EMAIL, password: ROUTES_PASSWORD, email_confirm: true });
    if (error) throw error;
    routesUserId = data.user!.id;
    await admin.from("venue_staff").insert({ user_id: routesUserId, venue_id: routesVenueId });
    routesOwnerId = (await admin.rpc("create_venue_manager", { p_venue_id: routesVenueId, p_name: "Власник", p_password: "owner-pass-123", p_is_owner: true })).data as string;
    routesManagerId = (await admin.rpc("create_venue_manager", { p_venue_id: routesVenueId, p_name: "Менаџер", p_password: "manager-pass-123", p_is_owner: false })).data as string;
    ownerToken = (await createManagerElevation(routesVenueId, routesOwnerId, "Власник", true)).token;
    managerToken = (await createManagerElevation(routesVenueId, routesManagerId, "Менаџер", false)).token;
  });
  afterAll(async () => {
    if (routesUserId) await admin.auth.admin.deleteUser(routesUserId);
    await admin.from("venues").delete().eq("id", routesVenueId);
  });

  function req(token?: string, body?: unknown) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers[MANAGER_TOKEN_HEADER] = token;
    return new NextRequest("http://localhost/api/venue/managers", {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("GET lists managers for the owner", async () => {
    const { GET: listRoute } = await import("@/app/api/venue/managers/route");
    const res = await listRoute(req(ownerToken), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("GET refuses a non-owner manager", async () => {
    const { GET: listRoute } = await import("@/app/api/venue/managers/route");
    const res = await listRoute(req(managerToken), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it("POST adds a manager for the owner", async () => {
    const { POST: addRoute } = await import("@/app/api/venue/managers/route");
    const res = await addRoute(req(ownerToken, { name: "Route Added", password: "route-added-pass-1" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("DELETE refuses a non-owner manager", async () => {
    const { DELETE: removeRoute } = await import("@/app/api/venue/managers/[managerId]/route");
    const headers = new Headers();
    headers.set(MANAGER_TOKEN_HEADER, managerToken);
    const res = await removeRoute(new NextRequest("http://localhost/api/venue/managers/x", { method: "DELETE", headers }), { params: Promise.resolve({ managerId: routesOwnerId }) });
    expect(res.status).toBe(403);
  });
});
