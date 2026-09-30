import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

// SEC-019 (update must check the destination folder) and SEC-020 (no
// anonymous listing of the public buckets; public URLs still load).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

const email = "storage-policies@test.local";
const password = "test-password-123";
let userId: string;
let venueA: string;
let venueB: string;
let staff: SupabaseClient;

const png = () => new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });

beforeAll(async () => {
  const { data: a } = await admin.from("venues").insert({ name: "Storage Venue A" }).select("id").single();
  const { data: b } = await admin.from("venues").insert({ name: "Storage Venue B" }).select("id").single();
  venueA = a!.id;
  venueB = b!.id;
  const { data: user, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = user.user.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueA });

  staff = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: signInError } = await staff.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
});

afterAll(async () => {
  for (const bucket of ["menu-item-photos", "event-showcase-photos", "invitation-photos"]) {
    for (const folder of [venueA, venueB]) {
      const { data } = await admin.storage.from(bucket).list(folder);
      if (data?.length) await admin.storage.from(bucket).remove(data.map((f) => `${folder}/${f.name}`));
    }
  }
  await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().in("id", [venueA, venueB]);
});

describe("menu photo updates (SEC-019)", () => {
  it("lets staff upload and re-upload (upsert) their own venue's photo", async () => {
    const path = `${venueA}/dish.png`;
    expect((await staff.storage.from("menu-item-photos").upload(path, png(), { upsert: true })).error).toBeNull();
    expect((await staff.storage.from("menu-item-photos").upload(path, png(), { upsert: true })).error).toBeNull();
  });

  it("refuses moving an object into another venue's folder", async () => {
    const from = `${venueA}/move-me.png`;
    expect((await staff.storage.from("menu-item-photos").upload(from, png())).error).toBeNull();

    const { error } = await staff.storage.from("menu-item-photos").move(from, `${venueB}/planted.png`);
    expect(error).not.toBeNull();

    const { data } = await admin.storage.from("menu-item-photos").list(venueB);
    expect(data).toEqual([]);
  });

  it("refuses the rename at the policy level, not only in the Storage API", async () => {
    // The Storage API's own move() already checks the destination; this runs
    // the UPDATE as the signed-in staff role to prove the policy's WITH CHECK.
    const from = `${venueA}/policy-probe.png`;
    expect((await staff.storage.from("menu-item-photos").upload(from, png())).error).toBeNull();

    const db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await db.connect();
    try {
      await db.query("begin");
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
      await expect(
        db.query("update storage.objects set name = $1 where bucket_id = 'menu-item-photos' and name = $2", [`${venueB}/planted.png`, from]),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });

  it("refuses uploading straight into another venue's folder", async () => {
    const { error } = await staff.storage.from("menu-item-photos").upload(`${venueB}/x.png`, png());
    expect(error).not.toBeNull();
  });
});

describe("no anonymous listing (SEC-020)", () => {
  beforeAll(async () => {
    await admin.storage.from("menu-item-photos").upload(`${venueA}/listed.png`, png(), { upsert: true });
    await admin.storage.from("event-showcase-photos").upload(`${venueA}/listed.png`, png(), { upsert: true });
    await admin.storage.from("invitation-photos").upload(`${venueA}/listed.png`, png(), { upsert: true });
  });

  it("returns nothing when anon lists any of the three buckets", async () => {
    for (const bucket of ["menu-item-photos", "event-showcase-photos", "invitation-photos"]) {
      const root = await anon.storage.from(bucket).list();
      const folder = await anon.storage.from(bucket).list(venueA);
      expect(root.data ?? [], bucket).toEqual([]);
      expect(folder.data ?? [], bucket).toEqual([]);
    }
  });

  it("still serves the public URL of a photo", async () => {
    for (const bucket of ["menu-item-photos", "event-showcase-photos", "invitation-photos"]) {
      const { data } = anon.storage.from(bucket).getPublicUrl(`${venueA}/listed.png`);
      const res = await fetch(data.publicUrl);
      expect(res.status, bucket).toBe(200);
    }
  });

  it("still lets staff list their own venue's folder", async () => {
    const { data, error } = await staff.storage.from("menu-item-photos").list(venueA);
    expect(error).toBeNull();
    expect(data!.map((f) => f.name)).toContain("listed.png");
  });
});
