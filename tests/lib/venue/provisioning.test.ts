// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { provisionVenueForUser } from "@/lib/venue/provisioning";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/venue/provisioning: provisionVenueForUser", () => {
  it("creates a venue and links the given user as staff", async () => {
    const { data: user } = await admin.auth.admin.createUser({
      email: "provision-test-1@test.local",
      password: "test-password-123",
      email_confirm: true,
    });

    const result = await provisionVenueForUser(user!.user!.id, "Нов Локал");
    expect(result.venue_id).toBeTruthy();

    const { data: venue } = await admin.from("venues").select("name").eq("id", result.venue_id).single();
    expect(venue!.name).toBe("Нов Локал");

    const { data: staffRow } = await admin
      .from("venue_staff")
      .select("venue_id")
      .eq("user_id", user!.user!.id)
      .single();
    expect(staffRow!.venue_id).toBe(result.venue_id);

    await admin.from("venues").delete().eq("id", result.venue_id);
    await admin.auth.admin.deleteUser(user!.user!.id);
  });

  it("is idempotent — calling it again for an already-provisioned user returns the same venue, not a second one", async () => {
    const { data: user } = await admin.auth.admin.createUser({
      email: "provision-test-2@test.local",
      password: "test-password-123",
      email_confirm: true,
    });

    const first = await provisionVenueForUser(user!.user!.id, "Прв обид");
    const second = await provisionVenueForUser(user!.user!.id, "Втор обид (би требало да се игнорира)");

    expect(second.venue_id).toBe(first.venue_id);

    const { count } = await admin
      .from("venue_staff")
      .select("venue_id", { count: "exact", head: true })
      .eq("user_id", user!.user!.id);
    expect(count).toBe(1);

    await admin.from("venues").delete().eq("id", first.venue_id);
    await admin.auth.admin.deleteUser(user!.user!.id);
  });
});
