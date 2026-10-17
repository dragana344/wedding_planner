import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  verifyVenueManager, createManagerElevation, validateManagerElevation, deleteManagerElevation,
} from "@/lib/venue/manager-elevation";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let otherVenueId: string;
let managerId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Elevation Venue ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Other Venue ${stamp}` }).select("id").single()).data!.id;
  managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Елена", p_password: "correct-password-1", p_is_owner: true })).data as string;
});
afterAll(async () => {
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

describe("verifyVenueManager", () => {
  it("resolves the manager on a correct password", async () => {
    const result = await verifyVenueManager(venueId, "Елена", "correct-password-1");
    expect(result).toEqual({ managerId, managerName: "Елена", isOwner: true });
  });

  it("returns errorCode 'invalid' on a wrong password", async () => {
    const result = await verifyVenueManager(venueId, "Елена", "wrong");
    expect(result).toEqual({ errorCode: "invalid" });
  });
});

describe("manager elevation tokens", () => {
  it("creates a token, validates it for the right venue, and rejects it for a different venue", async () => {
    const elevation = await createManagerElevation(venueId, managerId, "Елена", true);
    expect(elevation.token).toHaveLength(64); // 32 bytes, hex
    expect(elevation.managerName).toBe("Елена");
    expect(elevation.isOwner).toBe(true);

    const valid = await validateManagerElevation(elevation.token, venueId);
    expect(valid).toEqual({ managerId, managerName: "Елена", isOwner: true });

    const wrongVenue = await validateManagerElevation(elevation.token, otherVenueId);
    expect(wrongVenue).toBeNull();
  });

  it("stores the token hashed, not in the clear", async () => {
    const elevation = await createManagerElevation(venueId, managerId, "Елена", true);
    const { data } = await admin.from("venue_manager_elevations").select("token").eq("manager_id", managerId).order("created_at", { ascending: false }).limit(1).single();
    expect(data!.token).not.toBe(elevation.token);
  });

  it("rejects an expired token", async () => {
    const elevation = await createManagerElevation(venueId, managerId, "Елена", true);
    await admin.from("venue_manager_elevations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("manager_id", managerId);
    const result = await validateManagerElevation(elevation.token, venueId);
    expect(result).toBeNull();
  });

  it("deletes a token so it no longer validates", async () => {
    const elevation = await createManagerElevation(venueId, managerId, "Елена", true);
    await deleteManagerElevation(elevation.token);
    const result = await validateManagerElevation(elevation.token, venueId);
    expect(result).toBeNull();
  });

  it("rejects a token that was never issued", async () => {
    const result = await validateManagerElevation("0".repeat(64), venueId);
    expect(result).toBeNull();
  });

  it("reflects a non-owner manager's isOwner as false", async () => {
    const staffId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Стефан", p_password: "staff-pass-123", p_is_owner: false })).data as string;
    const elevation = await createManagerElevation(venueId, staffId, "Стефан", false);
    const result = await validateManagerElevation(elevation.token, venueId);
    expect(result).toEqual({ managerId: staffId, managerName: "Стефан", isOwner: false });
  });
});
