// tests/lib/couple/auth.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { verifyEventCredentials } from "@/lib/couple/auth";
import { createEventCredentials } from "@/lib/venue/credentials";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueId: string;
let eventId: string;
const staffEmail = "auth-lib-staff@test.local";
const staffPassword = "test-password-123";
let staffUserId: string;

describe("lib/couple/auth", () => {
  beforeAll(async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Auth Lib Venue" }).select().single();
    venueId = venue!.id;
    const { data: userRes } = await admin.auth.admin.createUser({ email: staffEmail, password: staffPassword, email_confirm: true });
    staffUserId = userRes!.user!.id;
    await admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: venueId });
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venueId, couple_names: "Auth & Test", event_date: "2026-11-25" })
      .select()
      .single();
    eventId = event!.id;

    const staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await staffClient.auth.signInWithPassword({ email: staffEmail, password: staffPassword });
    await createEventCredentials(eventId, "auth-lib-username", "correct-password", staffClient);
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(staffUserId);
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("returns the event id for correct credentials", async () => {
    const result = await verifyEventCredentials("auth-lib-username", "correct-password");
    expect("eventId" in result && result.eventId).toBe(eventId);
  });

  it("returns an 'invalid' error code for a wrong password", async () => {
    const result = await verifyEventCredentials("auth-lib-username", "wrong-password");
    expect("errorCode" in result && result.errorCode).toBe("invalid");
  });
});
