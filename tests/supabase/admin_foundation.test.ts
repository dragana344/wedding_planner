import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let adminUserId: string;
let staffUserId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: "Admin Foundation Venue" }).select("id").single()).data!.id;
  const a = await admin.auth.admin.createUser({ email: `pa-${stamp}@test.local`, password: "admin-password-123", email_confirm: true, app_metadata: { role: "platform_admin" } });
  adminUserId = a.data.user!.id;
  const s = await admin.auth.admin.createUser({ email: `staff-${stamp}@test.local`, password: "staff-password-123", email_confirm: true });
  staffUserId = s.data.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: venueId });
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.auth.admin.deleteUser(staffUserId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("admin foundation (0047)", () => {
  it("never lets a platform admin become venue staff", async () => {
    const { error } = await admin.from("venue_staff").insert({ user_id: adminUserId, venue_id: venueId });
    expect(error?.message).toMatch(/platform admin/i);
  });

  it("accepts admin audit rows", async () => {
    const { error } = await admin.from("audit_log").insert({ actor_type: "admin", actor_id: adminUserId, action: "test_admin_action", venue_id: venueId });
    expect(error).toBeNull();
  });

  it("signs a user out of every session", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: `staff-${stamp}@test.local`, password: "staff-password-123" });
    const refresh = (await c.auth.getSession()).data.session!.refresh_token;
    expect((await admin.rpc("admin_sign_out_user", { p_user_id: staffUserId })).error).toBeNull();
    const again = await createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } }).auth.refreshSession({ refresh_token: refresh });
    expect(again.error).not.toBeNull();
  });

  it("clears a couple lockout", async () => {
    const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Lock & Test", event_date: "2028-01-10" }).select("id").single()).data!.id;
    await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `lock-${stamp}`, p_password: "long-enough-99" });
    await admin.from("event_credentials").update({ failed_attempts: 5, locked_until: new Date(Date.now() + 900_000).toISOString() }).eq("event_id", eventId);
    expect((await admin.rpc("admin_unlock_couple_login", { p_event_id: eventId })).error).toBeNull();
    const { data } = await admin.from("event_credentials").select("failed_attempts, locked_until").eq("event_id", eventId).single();
    expect(data).toEqual({ failed_attempts: 0, locked_until: null });
  });

  it("keeps the new functions away from API roles", async () => {
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc("admin_sign_out_user", { p_user_id: staffUserId })).error).not.toBeNull();
  });
});
