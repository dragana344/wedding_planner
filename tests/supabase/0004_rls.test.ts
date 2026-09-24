import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueAId: string;
let venueBId: string;
let staffAEmail = "staff-a@test.local";
let staffAPassword = "test-password-123";
let staffAUserId: string;

describe("0004 RLS: venue staff isolation", () => {
  beforeAll(async () => {
    const { data: venueA } = await admin.from("venues").insert({ name: "Venue A" }).select().single();
    const { data: venueB } = await admin.from("venues").insert({ name: "Venue B" }).select().single();
    venueAId = venueA!.id;
    venueBId = venueB!.id;

    const { data: userA } = await admin.auth.admin.createUser({
      email: staffAEmail,
      password: staffAPassword,
      email_confirm: true,
    });
    staffAUserId = userA!.user!.id;
    await admin.from("venue_staff").insert({ user_id: staffAUserId, venue_id: venueAId });
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(staffAUserId);
    await admin.from("venues").delete().in("id", [venueAId, venueBId]);
  });

  it("lets staff read their own venue but not another venue", async () => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await client.auth.signInWithPassword({ email: staffAEmail, password: staffAPassword });

    const { data: ownVenue } = await client.from("venues").select().eq("id", venueAId);
    expect(ownVenue).toHaveLength(1);

    const { data: otherVenue } = await client.from("venues").select().eq("id", venueBId);
    expect(otherVenue).toHaveLength(0);
  });
});
