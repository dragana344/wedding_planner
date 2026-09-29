// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getCurrentVenue, getCurrentVenueId } from "@/lib/venue/current-venue";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const staffEmail = "current-venue-staff@test.local";
const password = "test-password-123";

let venueId: string;
let staffUserId: string;

describe("getCurrentVenueId", () => {
  beforeAll(async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Current Venue Test" }).select().single();
    venueId = venue!.id;

    const { data: user } = await admin.auth.admin.createUser({
      email: staffEmail,
      password,
      email_confirm: true,
    });
    staffUserId = user!.user!.id;
    await admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: venueId });
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(staffUserId);
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("returns the signed-in staff member's venue_id via the request-scoped anon client", async () => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await client.auth.signInWithPassword({ email: staffEmail, password });

    const result = await getCurrentVenueId(client);
    expect(result).toBe(venueId);
  });

  it("getCurrentVenue returns the venue's id and name in one lookup", async () => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await client.auth.signInWithPassword({ email: staffEmail, password });

    expect(await getCurrentVenue(client)).toEqual({ id: venueId, name: "Current Venue Test" });
  });

  it("returns null when there is no signed-in user", async () => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const result = await getCurrentVenueId(client);
    expect(result).toBeNull();
  });
});
