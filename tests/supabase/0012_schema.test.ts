import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("0012 schema: floor plan layers", () => {
  it("seeds a default layout password and lets fixed/layout elements be created", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Floor Plan Test Venue" }).select().single();
    expect(venue!.layout_lock_password_hash).toBeTruthy();

    const { data: verifyOk } = await admin.rpc("verify_venue_layout_password", {
      p_venue_id: venue!.id,
      p_password: "0000",
    });
    // service_role bypasses is_venue_staff_for's auth.uid() check (no session), so this
    // call returns false here — it's exercised properly as an authenticated user in
    // tests/lib/venue/floorplan.test.ts. This test only confirms the hash was seeded.
    expect(typeof verifyOk).toBe("boolean");

    const { data: room } = await admin
      .from("rooms")
      .insert({ venue_id: venue!.id, name: "Main Hall" })
      .select()
      .single();
    expect(room!.width_cm).toBe(2000);
    expect(room!.height_cm).toBe(1500);

    const { data: fixed, error: fixedError } = await admin
      .from("room_fixed_elements")
      .insert({ room_id: room!.id, element_type: "wall", x_cm: 0, y_cm: 0, width_cm: 2000, height_cm: 10 })
      .select()
      .single();
    expect(fixedError).toBeNull();
    expect(fixed!.element_type).toBe("wall");

    const { data: layoutEl, error: layoutError } = await admin
      .from("room_layout_elements")
      .insert({ room_id: room!.id, element_type: "stage", x_cm: 100, y_cm: 100, width_cm: 300, length_cm: 200 })
      .select()
      .single();
    expect(layoutError).toBeNull();
    expect(layoutEl!.element_type).toBe("stage");

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
