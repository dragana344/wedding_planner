import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// S3 task 10 (migration 0074): venue profile — address, phone, logo. The logo
// lives in the event-showcase-photos bucket under the venue's own folder.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const RUN = `vprof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "venue-profile-password-123";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

let venueA: string;
let venueB: string;
let userId: string;
let staff: SupabaseClient;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

beforeAll(async () => {
  venueA = (await must(admin.from("venues").insert({ name: `${RUN} A` }).select("id").single())).id;
  venueB = (await must(admin.from("venues").insert({ name: `${RUN} B` }).select("id").single())).id;
  const email = `${RUN}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await must(admin.from("venue_staff").insert({ user_id: userId, venue_id: venueA }));
  staff = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await staff.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw signIn.error;
}, 60_000);

afterAll(async () => {
  await staff?.auth.signOut();
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.storage.from("event-showcase-photos").remove([`${venueA}/logo-1.png`, `${venueA}/logo-2.png`]);
  await admin.from("storage_cleanup_queue").delete().like("path", `${venueA}/%`);
  await admin.from("venues").delete().in("id", [venueA, venueB]);
});

describe("venue profile (0074)", () => {
  it("staff update their own venue's address and phone, not another venue's", async () => {
    const own = await staff.from("venues").update({ address: "ул. Маршал Тито 1, Радовиш", phone: "+389 70 111 222" }).eq("id", venueA).select("address, phone");
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ address: "ул. Маршал Тито 1, Радовиш", phone: "+389 70 111 222" }]);
    const other = await staff.from("venues").update({ address: "упад" }).eq("id", venueB).select();
    expect(other.data ?? []).toEqual([]);
  });

  it("limits the field lengths", async () => {
    expect((await admin.from("venues").update({ address: "x".repeat(301) }).eq("id", venueA)).error?.code).toBe("23514");
    expect((await admin.from("venues").update({ phone: "1".repeat(51) }).eq("id", venueA)).error?.code).toBe("23514");
    expect((await admin.from("venues").update({ logo_path: `${venueB}/logo-1.png` }).eq("id", venueA)).error?.code).toBe("23514");
  });

  it("uploads the logo into the venue's own folder only", async () => {
    const own = await staff.storage.from("event-showcase-photos").upload(`${venueA}/logo-1.png`, PNG, { contentType: "image/png" });
    expect(own.error).toBeNull();
    const foreign = await staff.storage.from("event-showcase-photos").upload(`${venueB}/logo-1.png`, PNG, { contentType: "image/png" });
    expect(foreign.error).not.toBeNull();
  });

  it("queues the old logo for deletion when it is replaced or removed", async () => {
    await must(staff.from("venues").update({ logo_path: `${venueA}/logo-1.png` }).eq("id", venueA));
    await must(staff.from("venues").update({ logo_path: `${venueA}/logo-2.png` }).eq("id", venueA));
    await must(staff.from("venues").update({ logo_path: null }).eq("id", venueA));
    const queued = await must(admin.from("storage_cleanup_queue").select("bucket, path").like("path", `${venueA}/logo-%`).order("id"));
    expect(queued).toEqual([
      { bucket: "event-showcase-photos", path: `${venueA}/logo-1.png` },
      { bucket: "event-showcase-photos", path: `${venueA}/logo-2.png` },
    ]);
  });
});
