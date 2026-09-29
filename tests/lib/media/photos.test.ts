// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  createPhotoUpload, confirmPhotoUpload, listPhotos, setPhotoHidden, deletePhoto, listPhotoFiles,
  PHOTO_TOO_LARGE_ERROR, UNSUPPORTED_MEDIA_ERROR, INVALID_MEDIA_UPLOAD_ERROR,
} from "@/lib/media/photos";
import { MEDIA_BUCKET, sweepStalePendingMedia } from "@/lib/media/storage";
import { QUOTA_FULL_ERROR } from "@/lib/media/album";
import { DEFAULT_STORAGE_BYTES, MAX_PHOTO_BYTES } from "@/lib/media/limits";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const guest = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } }); // no session
let venueId: string;
let eventId: string;
let otherEventId: string;
let fullEventId: string;

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 1, 2, 3, 4, 5, 6]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function upload(event: string, bytes: Uint8Array<ArrayBuffer>, type = "image/jpeg") {
  const { path, token } = await createPhotoUpload(event, bytes.length);
  const { error } = await guest.storage.from(MEDIA_BUCKET).uploadToSignedUrl(path, token, new Blob([bytes], { type }), { contentType: type });
  expect(error).toBeNull();
  return path;
}

async function exists(path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await admin.storage.from(MEDIA_BUCKET).list(folder, { search: name });
  return (data ?? []).some((f) => f.name === name);
}

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Photos Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: events } = await admin
    .from("events")
    .insert([
      { venue_id: venueId, couple_names: "Photo One", event_date: "2027-08-01" },
      { venue_id: venueId, couple_names: "Photo Two", event_date: "2027-08-02" },
      { venue_id: venueId, couple_names: "Photo Full", event_date: "2027-08-03" },
    ])
    .select("id");
  [eventId, otherEventId, fullEventId] = events!.map((e) => e.id);
  // Fill the third event's album to 1 000 bytes under the limit with rows alone.
  const rows = [];
  let left = DEFAULT_STORAGE_BYTES - 1000;
  for (let i = 0; left > 0; i++) {
    const bytes = Math.min(MAX_PHOTO_BYTES, left);
    rows.push({ event_id: fullEventId, storage_path: `${fullEventId}/photos/fill-${i}.jpg`, bytes, mime: "image/jpeg", consent_at: new Date().toISOString() });
    left -= bytes;
  }
  const { error } = await admin.from("event_photos").insert(rows);
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await drainStorageCleanupQueue();
});

describe("guest photo upload", () => {
  it("stores a confirmed photo with its real size under a sniffed extension", async () => {
    const path = await upload(eventId, JPEG);
    expect(path).toMatch(new RegExp(`^pending/${eventId}/[0-9a-f-]{36}$`));
    const { id } = await confirmPhotoUpload(eventId, { path, uploaderName: "  Тетка Роса  ", width: 800, height: 600 });

    const { data: row } = await admin.from("event_photos").select("*").eq("id", id).single();
    expect(row).toMatchObject({ bytes: JPEG.length, mime: "image/jpeg", uploader_name: "Тетка Роса", width: 800, height: 600 });
    expect(row!.storage_path).toMatch(new RegExp(`^${eventId}/photos/[0-9a-f-]{36}\\.jpg$`));
    expect(row!.consent_at).not.toBeNull();
    expect(await exists(path)).toBe(false);
    expect(await exists(row!.storage_path)).toBe(true);
  });

  it("names the file by its bytes, not by what the browser claimed", async () => {
    const path = await upload(eventId, PNG, "image/jpeg");
    const { id } = await confirmPhotoUpload(eventId, { path });
    const { data: row } = await admin.from("event_photos").select("storage_path, mime").eq("id", id).single();
    expect(row).toMatchObject({ mime: "image/png" });
    expect(row!.storage_path).toMatch(/\.png$/);
  });

  it("refuses a non-image and deletes it", async () => {
    const path = await upload(eventId, new TextEncoder().encode("<!doctype html><script>alert(1)</script>"));
    await expect(confirmPhotoUpload(eventId, { path })).rejects.toThrow(UNSUPPORTED_MEDIA_ERROR);
    expect(await exists(path)).toBe(false);
  });

  it("refuses another event's upload", async () => {
    const path = await upload(otherEventId, JPEG);
    await expect(confirmPhotoUpload(eventId, { path })).rejects.toThrow(INVALID_MEDIA_UPLOAD_ERROR);
    await expect(confirmPhotoUpload(eventId, { path: "../../etc/passwd" })).rejects.toThrow(INVALID_MEDIA_UPLOAD_ERROR);
  });

  it("refuses to start an upload over 15 MB", async () => {
    await expect(createPhotoUpload(eventId, MAX_PHOTO_BYTES + 1)).rejects.toThrow(PHOTO_TOO_LARGE_ERROR);
  });

  it("refuses to start an upload the album has no room for", async () => {
    await expect(createPhotoUpload(fullEventId, 2000)).rejects.toThrow(QUOTA_FULL_ERROR);
  });

  it("re-checks the quota with the real size at confirm, deleting the file and adding no row", async () => {
    const big = new Uint8Array(2000);
    big.set(JPEG);
    const { path, token } = await createPhotoUpload(fullEventId, 10); // the browser under-declares
    await guest.storage.from(MEDIA_BUCKET).uploadToSignedUrl(path, token, new Blob([big], { type: "image/jpeg" }), { contentType: "image/jpeg" });
    const { count: before } = await admin.from("event_photos").select("*", { count: "exact", head: true }).eq("event_id", fullEventId);
    await expect(confirmPhotoUpload(fullEventId, { path })).rejects.toThrow(QUOTA_FULL_ERROR);
    const { count: after } = await admin.from("event_photos").select("*", { count: "exact", head: true }).eq("event_id", fullEventId);
    expect(after).toBe(before);
    expect(await exists(path)).toBe(false);
  });
});

describe("couple moderation", () => {
  it("hides a photo from the default list and shows it with includeHidden", async () => {
    const { id } = await confirmPhotoUpload(eventId, { path: await upload(eventId, JPEG), uploaderName: "Скриена" });
    await setPhotoHidden(eventId, id, true);
    expect((await listPhotos(eventId)).map((p) => p.id)).not.toContain(id);
    const all = await listPhotos(eventId, { includeHidden: true });
    expect(all.find((p) => p.id === id)).toMatchObject({ hidden: true, uploaderName: "Скриена" });
    expect(all.find((p) => p.id === id)!.url).toContain(`/${MEDIA_BUCKET}/`);
    await setPhotoHidden(eventId, id, false);
    expect((await listPhotos(eventId)).map((p) => p.id)).toContain(id);
  });

  it("ignores another event's photo ids", async () => {
    const { id } = await confirmPhotoUpload(eventId, { path: await upload(eventId, JPEG) });
    await setPhotoHidden(otherEventId, id, true);
    await deletePhoto(otherEventId, id);
    const { data: row } = await admin.from("event_photos").select("hidden_at").eq("id", id).single();
    expect(row).toEqual({ hidden_at: null });
  });

  it("deletes the row and the file", async () => {
    const { id } = await confirmPhotoUpload(eventId, { path: await upload(eventId, JPEG) });
    const { data: row } = await admin.from("event_photos").select("storage_path").eq("id", id).single();
    await deletePhoto(eventId, id);
    expect((await admin.from("event_photos").select("id").eq("id", id)).data).toEqual([]);
    expect(await exists(row!.storage_path)).toBe(false);
  });

  it("lists visible files, oldest first, for the zip", async () => {
    const files = await listPhotoFiles(eventId);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.path.startsWith(`${eventId}/photos/`))).toBe(true);
    const times = files.map((f) => f.createdAt);
    expect([...times].sort()).toEqual(times);
  });
});

describe("pending sweep", () => {
  it("removes unconfirmed uploads older than the cutoff only", async () => {
    const fresh = await upload(otherEventId, JPEG);
    expect((await sweepStalePendingMedia(60 * 60 * 1000)).removed).toBe(0);
    expect(await exists(fresh)).toBe(true);
    // Not 0: other test files confirm their own pending uploads in parallel, within well under a second.
    await new Promise((r) => setTimeout(r, 1500));
    expect((await sweepStalePendingMedia(1000)).removed).toBeGreaterThan(0);
    expect(await exists(fresh)).toBe(false);
  });
});
