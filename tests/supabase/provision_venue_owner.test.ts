import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const createdVenueIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdVenueIds.length) await admin.from("venues").delete().in("id", createdVenueIds);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe("provision_venue — owner creation", () => {
  it("creates the venue, staff row, and an owner manager row in one call", async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({ email: `provision-owner-${stamp}@test.local`, password: "pw-doesnt-matter-1", email_confirm: true });
    if (userError) throw userError;
    createdUserIds.push(user.user!.id);

    const { data: venueId, error } = await admin.rpc("provision_venue", {
      p_user_id: user.user!.id, p_venue_name: "Owner Test Venue", p_owner_name: "owner", p_owner_password: "owner-pass-123",
    });
    expect(error).toBeNull();
    createdVenueIds.push(venueId as string);

    const { data: managers } = await admin.from("venue_managers").select("name, is_owner").eq("venue_id", venueId as string);
    expect(managers).toEqual([{ name: "owner", is_owner: true }]);

    const { data: verify } = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "owner", p_password: "owner-pass-123" });
    expect(verify![0].error_code).toBeNull();
  });

  it("is idempotent — a retry for the same user does not create a second owner", async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({ email: `provision-owner-retry-${stamp}@test.local`, password: "pw-doesnt-matter-1", email_confirm: true });
    if (userError) throw userError;
    createdUserIds.push(user.user!.id);

    const first = await admin.rpc("provision_venue", { p_user_id: user.user!.id, p_venue_name: "Retry Venue", p_owner_name: "owner", p_owner_password: "owner-pass-123" });
    createdVenueIds.push(first.data as string);
    const second = await admin.rpc("provision_venue", { p_user_id: user.user!.id, p_venue_name: "Retry Venue Again", p_owner_name: "someone-else", p_owner_password: "whatever-pass-1" });
    expect(second.data).toBe(first.data); // same venue id returned, no second venue created

    const { data: managers } = await admin.from("venue_managers").select("name").eq("venue_id", first.data as string);
    expect(managers).toHaveLength(1); // still just the original owner, "someone-else" was never inserted
  });
});
