// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { POST as startPhoto } from "@/app/api/e/[token]/photos/route";
import { POST as confirmPhoto } from "@/app/api/e/[token]/photos/confirm/route";
import { POST as startVideo } from "@/app/api/e/[token]/videos/route";
import { POST as confirmVideo } from "@/app/api/e/[token]/videos/confirm/route";
import { getOrCreateAlbumToken, getStorageUsage } from "@/lib/media/album";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// Session 4 (C1) / 0151: the guests' QR page talks only to these routes —
// photos and videos for the shared album (greetings moved to the invitation).
// No login: the album token is the credential, so unknown tokens are 404 and
// every route is rate limited per IP.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const guest = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
let venueId: string;
let eventId: string;
let token: string;

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0]);
// An MP4's first box: size, "ftyp", brand "isom".
const MP4 = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);

function call(
  handler: (req: NextRequest, ctx: { params: { token: string } }) => Promise<Response>,
  albumToken: string,
  body: unknown,
  ip = "203.0.113.7",
) {
  const req = new NextRequest(`http://localhost/api/e/${albumToken}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
  return handler(req, { params: { token: albumToken } });
}

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Guest Routes Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: event } = await admin.from("events").insert({ venue_id: venueId, couple_names: "Routes", event_date: "2027-10-01" }).select("id").single();
  eventId = event!.id;
  token = await getOrCreateAlbumToken(eventId);
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await drainStorageCleanupQueue();
});

describe("guest album routes", () => {
  it("answer 404 for an unknown album", async () => {
    const unknown = "u".repeat(24);
    for (const [handler, body] of [
      [startPhoto, { bytes: 10 }],
      [confirmPhoto, { path: "pending/x/y", consent: true }],
      [startVideo, { bytes: 10 }],
      [confirmVideo, { path: "pending/x/y", consent: true }],
    ] as const) {
      const res = await call(handler, unknown, body);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Албумот не постои." });
    }
  });

  it("uploads a photo end to end", async () => {
    const start = await call(startPhoto, token, { bytes: JPEG.length });
    expect(start.status).toBe(200);
    const { path, token: uploadToken, bucket } = await start.json();
    const { error } = await guest.storage.from(bucket).uploadToSignedUrl(path, uploadToken, new Blob([JPEG], { type: "image/jpeg" }), { contentType: "image/jpeg" });
    expect(error).toBeNull();

    const confirm = await call(confirmPhoto, token, { path, consent: true, uploader_name: "Вујко", width: 10, height: 10 });
    expect(confirm.status).toBe(200);
    const { id } = await confirm.json();
    const { data: row } = await admin.from("event_photos").select("event_id, uploader_name").eq("id", id).single();
    expect(row).toEqual({ event_id: eventId, uploader_name: "Вујко" });
  });

  it("needs the guest's consent to add a photo", async () => {
    for (const body of [{ path: `pending/${eventId}/${randomUUID()}` }, { path: `pending/${eventId}/${randomUUID()}`, consent: false }]) {
      const res = await call(confirmPhoto, token, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Потребна е согласност за прикажување во албумот." });
    }
  });

  it("refuses a photo over 15 MB before any upload", async () => {
    const res = await call(startPhoto, token, { bytes: 15 * 1024 * 1024 + 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/преголема/);
  });

  it("uploads a video end to end: it joins the album and counts as video space", async () => {
    const before = await getStorageUsage(eventId);
    const start = await call(startVideo, token, { bytes: MP4.length, seconds: 12 });
    expect(start.status).toBe(200);
    const { path, token: uploadToken, bucket } = await start.json();
    const { error } = await guest.storage.from(bucket).uploadToSignedUrl(path, uploadToken, new Blob([MP4], { type: "video/mp4" }), { contentType: "video/mp4" });
    expect(error).toBeNull();

    const confirm = await call(confirmVideo, token, { path, consent: true, uploader_name: "Тетка" });
    expect(confirm.status).toBe(200);
    const { id } = await confirm.json();
    const { data: row } = await admin.from("event_photos").select("event_id, uploader_name, mime, storage_path").eq("id", id).single();
    expect(row).toMatchObject({ event_id: eventId, uploader_name: "Тетка", mime: "video/mp4" });
    expect(row!.storage_path).toMatch(new RegExp(`^${eventId}/videos/.+\\.mp4$`));

    const after = await getStorageUsage(eventId);
    expect(after.videoBytes - before.videoBytes).toBe(MP4.length);
    expect(after.photoBytes).toBe(before.photoBytes);
  });

  it("refuses a video longer than the package's limit (30 s on the default plan)", async () => {
    const res = await call(startVideo, token, { bytes: 1000, seconds: 31 }, "198.51.102.9");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Видеото е подолго од 30 секунди." });
  });

  it("needs the guest's consent to add a video", async () => {
    const res = await call(confirmVideo, token, { path: `pending/${eventId}/${randomUUID()}` });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Потребна е согласност за прикажување во албумот." });
  });

  it("limits video uploads to 5 an hour per guest", async () => {
    const ip = `198.51.101.${Math.floor(Math.random() * 250)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(startVideo, token, { bytes: 1000 }, ip)).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
