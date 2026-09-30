// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  createGreeting, createVideoUpload, deleteGreeting, listGreetings, setGreetingHidden,
  NAME_REQUIRED_ERROR, MESSAGE_REQUIRED_ERROR, UNSUPPORTED_VIDEO_ERROR, VIDEO_TOO_LARGE_ERROR,
} from "@/lib/media/greetings";
import { MEDIA_BUCKET } from "@/lib/media/storage";
import { QUOTA_FULL_ERROR } from "@/lib/media/album";
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from "@/lib/media/limits";
// The default plan ("Стандарден", 0048) gives every event 5 GB (storage_gb).
const DEFAULT_STORAGE_BYTES = 5 * 1024 ** 3;
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const guest = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
let venueId: string;
let eventId: string;
let otherEventId: string;
let fullEventId: string;

const MP4 = Uint8Array.from([0, 0, 0, 0x18, ...Array.from(new TextEncoder().encode("ftypisom")), 0, 0, 2, 0, 9, 9, 9, 9]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0]);

async function uploadVideo(event: string, bytes: Uint8Array<ArrayBuffer>, type = "video/mp4") {
  const { path, token } = await createVideoUpload(event, bytes.length);
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
  const { data: venue } = await admin.from("venues").insert({ name: "Greetings Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: events } = await admin
    .from("events")
    .insert([
      { venue_id: venueId, couple_names: "Greet One", event_date: "2027-09-01" },
      { venue_id: venueId, couple_names: "Greet Two", event_date: "2027-09-02" },
      { venue_id: venueId, couple_names: "Greet Full", event_date: "2027-09-03" },
    ])
    .select("id");
  [eventId, otherEventId, fullEventId] = events!.map((e) => e.id);
  const rows = [];
  let left = DEFAULT_STORAGE_BYTES - 10;
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

describe("text greetings", () => {
  it("stores trimmed names and the message", async () => {
    const { id } = await createGreeting(eventId, { firstName: "  Ана ", lastName: " Петрова", message: " Честито и среќен живот! " });
    const { data: row } = await admin.from("event_greetings").select("*").eq("id", id).single();
    expect(row).toMatchObject({ first_name: "Ана", last_name: "Петрова", message: "Честито и среќен живот!", video_path: null });
  });

  it("requires a first and a last name, and a message", async () => {
    await expect(createGreeting(eventId, { firstName: "Ана", lastName: "   ", message: "Здраво" })).rejects.toThrow(NAME_REQUIRED_ERROR);
    await expect(createGreeting(eventId, { firstName: "", lastName: "Петрова", message: "Здраво" })).rejects.toThrow(NAME_REQUIRED_ERROR);
    await expect(createGreeting(eventId, { firstName: "Ана", lastName: "Петрова", message: "  " })).rejects.toThrow(MESSAGE_REQUIRED_ERROR);
  });
});

describe("video greetings", () => {
  it("attaches a real video under a sniffed extension with its real size", async () => {
    const path = await uploadVideo(eventId, MP4);
    const { id } = await createGreeting(eventId, { firstName: "Марко", lastName: "Марков", message: "Видео честитка", videoPath: path });
    const { data: row } = await admin.from("event_greetings").select("video_path, video_bytes").eq("id", id).single();
    expect(row!.video_path).toMatch(new RegExp(`^${eventId}/videos/[0-9a-f-]{36}\\.mp4$`));
    expect(row!.video_bytes).toBe(MP4.length);
    expect(await exists(path)).toBe(false);
    expect(await exists(row!.video_path)).toBe(true);
  });

  it("refuses a file that is not a video, deleting it and saving no greeting", async () => {
    const path = await uploadVideo(eventId, JPEG);
    await expect(createGreeting(eventId, { firstName: "А", lastName: "Б", message: "x", videoPath: path })).rejects.toThrow(UNSUPPORTED_VIDEO_ERROR);
    expect(await exists(path)).toBe(false);
    expect((await admin.from("event_greetings").select("id").eq("event_id", eventId).eq("first_name", "А")).data).toEqual([]);
  });

  it("refuses another event's upload", async () => {
    const path = await uploadVideo(otherEventId, MP4);
    await expect(createGreeting(eventId, { firstName: "А", lastName: "Б", message: "x", videoPath: path })).rejects.toThrow("Неважечко прикачување.");
  });

  it("refuses videos over 100 MB and over the album's space", async () => {
    await expect(createVideoUpload(eventId, MAX_VIDEO_BYTES + 1)).rejects.toThrow(VIDEO_TOO_LARGE_ERROR);
    await expect(createVideoUpload(fullEventId, 100)).rejects.toThrow(QUOTA_FULL_ERROR);
  });
});

describe("couple moderation", () => {
  it("lists newest first with a signed video link, hides and deletes", async () => {
    const path = await uploadVideo(eventId, MP4);
    const { id } = await createGreeting(eventId, { firstName: "Јана", lastName: "Јанева", message: "Среќно!", videoPath: path });
    const list = await listGreetings(eventId);
    expect(list[0]).toMatchObject({ id, firstName: "Јана", lastName: "Јанева", message: "Среќно!", hidden: false });
    expect(list[0].videoUrl).toContain(`/${MEDIA_BUCKET}/`);

    await setGreetingHidden(eventId, id, true);
    expect((await listGreetings(eventId)).map((g) => g.id)).not.toContain(id);
    expect((await listGreetings(eventId, { includeHidden: true })).find((g) => g.id === id)?.hidden).toBe(true);

    await setGreetingHidden(otherEventId, id, false);
    await deleteGreeting(otherEventId, id);
    expect((await listGreetings(eventId, { includeHidden: true })).find((g) => g.id === id)?.hidden).toBe(true);

    const { data: row } = await admin.from("event_greetings").select("video_path").eq("id", id).single();
    await deleteGreeting(eventId, id);
    expect((await admin.from("event_greetings").select("id").eq("id", id)).data).toEqual([]);
    expect(await exists(row!.video_path)).toBe(false);
  });
});
