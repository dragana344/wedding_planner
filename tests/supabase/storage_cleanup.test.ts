import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { drainStorageCleanupQueue, sweepStaleInvitationUploads } from "@/lib/storage-cleanup";
import { GET as cronGET } from "@/app/api/cron/storage-cleanup/route";

// DATA-011: deleting rows (directly or by cascade) or replacing a photo
// removes the stored object once the cleanup queue is drained.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let venueId: string;

const png = () => new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });

async function put(bucket: string, path: string) {
  const { error } = await admin.storage.from(bucket).upload(path, png(), { upsert: true });
  if (error) throw error;
}

async function publicStatus(bucket: string, path: string) {
  return (await fetch(admin.storage.from(bucket).getPublicUrl(path).data.publicUrl)).status;
}

beforeAll(async () => {
  const { data } = await admin.from("venues").insert({ name: "Cleanup Venue" }).select("id").single();
  venueId = data!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await drainStorageCleanupQueue();
});

describe("storage cleanup (DATA-011)", () => {
  it("removes an event's showcase and invitation photos after the event is deleted", async () => {
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venueId, couple_names: "Cleanup & Test", event_date: "2027-07-01" })
      .select("id")
      .single();
    const showcase = `${venueId}/${event!.id}-1.png`;
    const invitation = `${event!.id}-1.png`;
    await put("event-showcase-photos", showcase);
    await put("invitation-photos", invitation);
    await admin.from("event_showcase_photos").insert({ event_id: event!.id, photo_path: showcase });
    await admin.from("event_invitations").insert({ event_id: event!.id, template_id: "classic", public_slug: `cleanup-${Date.now()}`, photo_path: invitation });
    expect(await publicStatus("event-showcase-photos", showcase)).toBe(200);

    await admin.from("events").delete().eq("id", event!.id);
    await drainStorageCleanupQueue();

    expect(await publicStatus("event-showcase-photos", showcase)).not.toBe(200);
    expect(await publicStatus("invitation-photos", invitation)).not.toBe(200);
  });

  it("removes the previous file when a photo is replaced, and keeps the new one", async () => {
    const oldPath = `${venueId}/dish-old.png`;
    const newPath = `${venueId}/dish-new.png`;
    await put("menu-item-photos", oldPath);
    await put("menu-item-photos", newPath);
    const { data: item } = await admin
      .from("menu_items")
      .insert({ venue_id: venueId, tiers: ["everyday"], course: "main", name: "Dish", photo_path: oldPath })
      .select("id")
      .single();

    await admin.from("menu_items").update({ photo_path: newPath }).eq("id", item!.id);
    await drainStorageCleanupQueue();

    expect(await publicStatus("menu-item-photos", oldPath)).not.toBe(200);
    expect(await publicStatus("menu-item-photos", newPath)).toBe(200);
  });

  it("queues the file when staff delete a row from the browser (authenticated role)", async () => {
    const email = `cleanup-staff-${Date.now()}@test.local`;
    const { data: user, error: userError } = await admin.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
    if (userError) throw userError;
    await admin.from("venue_staff").insert({ user_id: user.user.id, venue_id: venueId });
    const staff = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await staff.auth.signInWithPassword({ email, password: "test-password-123" });

    const path = `${venueId}/staff-dish.png`;
    await put("menu-item-photos", path);
    const { data: item } = await admin
      .from("menu_items")
      .insert({ venue_id: venueId, tiers: ["everyday"], course: "main", name: "Staff Dish", photo_path: path })
      .select("id")
      .single();

    try {
      const { error } = await staff.from("menu_items").delete().eq("id", item!.id);
      expect(error).toBeNull();
      await drainStorageCleanupQueue();
      expect(await publicStatus("menu-item-photos", path)).not.toBe(200);
    } finally {
      await admin.auth.admin.deleteUser(user.user.id);
    }
  });

  it("only runs the cron route with the cron secret", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const denied = await cronGET(new NextRequest("http://localhost/api/cron/storage-cleanup"));
    expect(denied.status).toBe(401);
    const allowed = await cronGET(
      new NextRequest("http://localhost/api/cron/storage-cleanup", { headers: { authorization: "Bearer test-cron-secret" } }),
    );
    expect(allowed.status).toBe(200);
    // Session 4: stale album uploads are swept too; media retention stays off until configured.
    expect(await allowed.json()).toMatchObject({ stale_media: expect.any(Number), media_retention: { skipped: true } });
    delete process.env.CRON_SECRET;
  });

  it("sweeps unconfirmed invitation uploads older than a day, keeping fresh ones (SEC-005)", async () => {
    const path = `uploads/${venueId}/00000000-0000-4000-8000-000000000001`;
    await put("invitation-photos", path);
    expect((await sweepStaleInvitationUploads(24 * 60 * 60 * 1000)).removed).toBe(0);
    await sweepStaleInvitationUploads(-1); // everything counts as stale
    expect(await publicStatus("invitation-photos", path)).not.toBe(200);
  });
});
