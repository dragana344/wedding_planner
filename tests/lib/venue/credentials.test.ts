// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createEventCredentials, regenerateEventPassword, getEventUsername } from "@/lib/venue/credentials";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const staffEmail = "credentials-lib-staff@test.local";
const staffPassword = "test-password-123";
let venueId: string;
let staffUserId: string;
let eventId: string;
let staffClient: ReturnType<typeof createClient>;

describe("lib/venue/credentials", () => {
  beforeAll(async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Credentials Lib Venue" }).select().single();
    venueId = venue!.id;
    const { data: userRes } = await admin.auth.admin.createUser({
      email: staffEmail,
      password: staffPassword,
      email_confirm: true,
    });
    staffUserId = userRes!.user!.id;
    await admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: venueId });

    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venueId, couple_names: "Lib & Test", event_date: "2026-11-15" })
      .select()
      .single();
    eventId = event!.id;

    staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await staffClient.auth.signInWithPassword({ email: staffEmail, password: staffPassword });
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(staffUserId);
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("creates credentials via a service-role client (security review fix: no longer callable by a plain staff session) and lets staff read the username back", async () => {
    await createEventCredentials(eventId, "lib-test-username", "a-strong-password", admin);
    const username = await getEventUsername(eventId, staffClient);
    expect(username).toBe("lib-test-username");
  });

  it("refuses create_event_credentials for a plain staff session now that the direct grant is revoked (0110) — a staff session could otherwise mint a couple login with a password of its own choosing", async () => {
    await expect(createEventCredentials(eventId, "should-not-exist", "a-strong-password", staffClient)).rejects.toThrow();
  });

  it("regenerates the password via a service-role client (migration 0102: no longer callable by a plain staff session)", async () => {
    await regenerateEventPassword(eventId, "a-new-password", admin);
    // Correctness of the new password is covered by 0013's RPC test; here we
    // only assert the call succeeds and the username is unchanged.
    const username = await getEventUsername(eventId, staffClient);
    expect(username).toBe("lib-test-username");
  });

  it("refuses a plain staff session now that the direct grant is revoked", async () => {
    await expect(regenerateEventPassword(eventId, "another-password", staffClient)).rejects.toThrow();
  });
});
