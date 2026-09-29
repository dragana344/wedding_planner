// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { POST as startPhoto } from "@/app/api/e/[token]/photos/route";
import { POST as confirmPhoto } from "@/app/api/e/[token]/photos/confirm/route";
import { POST as startVideo } from "@/app/api/e/[token]/greetings/video/route";
import { POST as postGreeting } from "@/app/api/e/[token]/greetings/route";
import { getOrCreateAlbumToken } from "@/lib/media/album";
import { MEDIA_BUCKET } from "@/lib/media/storage";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// Session 4 (C1, C2, C7): the guests' QR page talks only to these routes.
// No login: the album token is the credential, so unknown tokens are 404 and
// every route is rate limited per IP.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const guest = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
let venueId: string;
let eventId: string;
let token: string;

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0]);

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
      [postGreeting, { first_name: "А", last_name: "Б", message: "В" }],
    ] as const) {
      const res = await call(handler, unknown, body);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Албумот не постои." });
    }
  });

  it("uploads a photo end to end", async () => {
    const start = await call(startPhoto, token, { bytes: JPEG.length });
    expect(start.status).toBe(200);
    const { path, token: uploadToken } = await start.json();
    const { error } = await guest.storage.from(MEDIA_BUCKET).uploadToSignedUrl(path, uploadToken, new Blob([JPEG], { type: "image/jpeg" }), { contentType: "image/jpeg" });
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

  it("saves a greeting and requires both names", async () => {
    const ok = await call(postGreeting, token, { first_name: "Ана", last_name: "Петрова", message: "Честито!" });
    expect(ok.status).toBe(200);
    const missing = await call(postGreeting, token, { first_name: "Ана", last_name: " ", message: "Честито!" });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "Внесете име и презиме." });
  });

  it("limits greetings to 10 an hour per guest", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await call(postGreeting, token, { first_name: "Спам", last_name: `${i}`, message: "x" }, ip)).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
