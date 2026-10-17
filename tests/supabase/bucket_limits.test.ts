import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SEC-028: staff can upload real photos, but Storage itself refuses SVG,
// HTML and other non-images in the photo buckets.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const email = `bucket-limits-${Date.now()}@test.local`;
let userId: string;
let venueId: string;
let staff: SupabaseClient;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Bucket Limits Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: user } = await admin.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
  userId = user.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  staff = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staff.auth.signInWithPassword({ email, password: "test-password-123" });
});

afterAll(async () => {
  for (const bucket of ["menu-item-photos", "event-showcase-photos"]) {
    const { data } = await admin.storage.from(bucket).list(venueId);
    if (data?.length) await admin.storage.from(bucket).remove(data.map((f) => `${venueId}/${f.name}`));
  }
  await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/**
 * Uploads as the venue would: staff write menu photos directly; showcase
 * photos and the logo go through a one-time signed upload since 0107
 * (lib/venue/photo-upload.ts) — the bucket's limits apply either way.
 */
async function upload(bucket: string, path: string, blob: Blob) {
  if (bucket === "menu-item-photos") return staff.storage.from(bucket).upload(path, blob);
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw error;
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    .storage.from(bucket)
    .uploadToSignedUrl(data.path, data.token, blob);
}

describe("photo bucket type limits (SEC-028)", () => {
  for (const bucket of ["menu-item-photos", "event-showcase-photos"]) {
    it(`${bucket}: accepts a JPEG, refuses SVG, HTML and PDF`, async () => {
      const ok = await upload(bucket, `${venueId}/ok.jpg`, new Blob([jpeg], { type: "image/jpeg" }));
      expect(ok.error).toBeNull();
      for (const [name, type] of [
        ["evil.svg", "image/svg+xml"],
        ["page.html", "text/html"],
        ["doc.pdf", "application/pdf"],
      ]) {
        const { error } = await upload(bucket, `${venueId}/${name}`, new Blob(["<svg onload=alert(1)>"], { type }));
        expect(error, `${bucket} ${name}`).not.toBeNull();
      }
    });
  }

  it("sets the limits on all three buckets", async () => {
    const { data } = await admin.storage.listBuckets();
    for (const id of ["menu-item-photos", "event-showcase-photos", "invitation-photos"]) {
      const bucket = data!.find((b) => b.id === id)!;
      expect(bucket.allowed_mime_types).toEqual(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
      expect(bucket.file_size_limit).toBe(52428800);
    }
  });
});
