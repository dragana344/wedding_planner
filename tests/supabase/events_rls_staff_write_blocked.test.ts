import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Final review finding (Critical) on Plan 2: the new /api/venue/events
// routes check the manager-elevation token, but until this fix the
// underlying RLS policy ("venue staff manage own events") still let ANY
// signed-in staff member write directly via their own browser client,
// completely bypassing the gate — e.g. from devtools:
// supabase.from('events').delete()...
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const stamp = Date.now();
let venueId: string;
let userId: string;
let eventId: string;
let staffClient: SupabaseClient;
const EMAIL = `rls-staff-write-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `RLS Staff Write Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "RLS Test Pair", event_date: "2027-03-01" }).select("id").single()).data!.id;
  staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
  await staffClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("events RLS — plain staff cannot write directly (bypassing manager elevation)", () => {
  it("refuses a direct insert from a plain staff session", async () => {
    const { error } = await staffClient.from("events").insert({ venue_id: venueId, couple_names: "Sneaky Pair", event_date: "2027-03-02" });
    expect(error).not.toBeNull();
  });

  it("refuses a direct update from a plain staff session", async () => {
    const { error } = await staffClient.from("events").update({ couple_names: "Hacked Name" }).eq("id", eventId);
    expect(error).not.toBeNull();
    const { data } = await admin.from("events").select("couple_names").eq("id", eventId).single();
    expect(data!.couple_names).toBe("RLS Test Pair");
  });

  it("refuses a direct delete from a plain staff session", async () => {
    // With no DELETE policy, RLS makes the row invisible to the delete's
    // WHERE clause — PostgREST reports success with zero rows affected
    // rather than an error, so the real assertion is that the row survives.
    await staffClient.from("events").delete().eq("id", eventId);
    const { data } = await admin.from("events").select("id").eq("id", eventId);
    expect(data).toHaveLength(1);
  });

  it("still allows a plain staff session to read events (unchanged)", async () => {
    const { data, error } = await staffClient.from("events").select("id").eq("id", eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
