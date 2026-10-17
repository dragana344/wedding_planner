import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { requireManagerElevation, requireOwnerElevation, MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";
import { createManagerElevation } from "@/lib/venue/manager-elevation";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let otherVenueId: string;
let ownerId: string;
let staffManagerId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Guard Venue ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Guard Other Venue ${stamp}` }).select("id").single()).data!.id;
  ownerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Власник", p_password: "owner-pass-123", p_is_owner: true })).data as string;
  staffManagerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-123", p_is_owner: false })).data as string;
});
afterAll(async () => {
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

function reqWithToken(token?: string) {
  const headers = new Headers();
  if (token) headers.set(MANAGER_TOKEN_HEADER, token);
  return new Request("http://localhost/api/venue/events", { headers });
}

describe("requireManagerElevation", () => {
  it("resolves for a valid manager token on the right venue", async () => {
    const elevation = await createManagerElevation(venueId, staffManagerId, "Менаџер", false);
    const result = await requireManagerElevation(reqWithToken(elevation.token), venueId);
    expect(result).toEqual({ managerId: staffManagerId, managerName: "Менаџер", isOwner: false });
  });

  it("returns null with no header at all", async () => {
    expect(await requireManagerElevation(reqWithToken(), venueId)).toBeNull();
  });

  it("returns null for a token issued for a different venue", async () => {
    const elevation = await createManagerElevation(venueId, staffManagerId, "Менаџер", false);
    expect(await requireManagerElevation(reqWithToken(elevation.token), otherVenueId)).toBeNull();
  });

  it("returns null for a token that was never issued", async () => {
    expect(await requireManagerElevation(reqWithToken("0".repeat(64)), venueId)).toBeNull();
  });
});

describe("requireOwnerElevation", () => {
  it("resolves for the owner's token", async () => {
    const elevation = await createManagerElevation(venueId, ownerId, "Власник", true);
    const result = await requireOwnerElevation(reqWithToken(elevation.token), venueId);
    expect(result).toEqual({ managerId: ownerId, managerName: "Власник", isOwner: true });
  });

  it("returns null for a valid non-owner manager's token", async () => {
    const elevation = await createManagerElevation(venueId, staffManagerId, "Менаџер", false);
    expect(await requireOwnerElevation(reqWithToken(elevation.token), venueId)).toBeNull();
  });
});
