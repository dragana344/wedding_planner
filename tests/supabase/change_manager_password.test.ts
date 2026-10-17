import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { changeManagerPassword } from "@/lib/venue/managers";
import { createManagerElevation, validateManagerElevation } from "@/lib/venue/manager-elevation";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let managerId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Change Pass Venue ${stamp}` }).select("id").single()).data!.id;
  managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "old-password-1", p_is_owner: false })).data as string;
});
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("changeManagerPassword", () => {
  it("changes the password so the old one no longer verifies and the new one does", async () => {
    await changeManagerPassword(managerId, "brand-new-password-1");
    const oldCheck = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "old-password-1" });
    expect(oldCheck.data![0].error_code).toBe("invalid");
    const newCheck = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "brand-new-password-1" });
    expect(newCheck.data![0].error_code).toBeNull();
  });

  it("revokes every existing elevation for that manager (final review finding)", async () => {
    const otherManagerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Друг", p_password: "other-pass-123", p_is_owner: false })).data as string;
    const elevation = await createManagerElevation(venueId, otherManagerId, "Друг", false);
    expect(await validateManagerElevation(elevation.token, venueId)).not.toBeNull();

    await changeManagerPassword(otherManagerId, "fresh-password-123");

    expect(await validateManagerElevation(elevation.token, venueId)).toBeNull();
  });

  it("clears failed_attempts/locked_until (so the account isn't still locked after a reset)", async () => {
    const lockedManagerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Заклучен", p_password: "orig-pass-123", p_is_owner: false })).data as string;
    for (let i = 0; i < 5; i++) {
      await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Заклучен", p_password: "wrong" });
    }
    const locked = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Заклучен", p_password: "orig-pass-123" });
    expect(locked.data![0].error_code).toBe("locked");

    await changeManagerPassword(lockedManagerId, "unlocked-password-1");

    const afterChange = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Заклучен", p_password: "unlocked-password-1" });
    expect(afterChange.data![0].error_code).toBeNull();
  });
});
