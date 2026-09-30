import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as startUpload } from "@/app/api/couple/invitation/photo/route";
import { POST as confirmUpload } from "@/app/api/couple/invitation/photo/confirm/route";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// SEC-005: photos go browser → Storage with a signed upload (no function body
// limit), and only real images of the allowed types are attached.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const browser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } }); // the couple's browser: no Supabase session
let venueId: string;
let eventId: string;
let otherEventId: string;

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];

function coupleRequest(path: string, event: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "x-couple-event-id": event, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function uploadAs(event: string, blob: Blob) {
  const start = await startUpload(coupleRequest("/api/couple/invitation/photo", event), { params: {} });
  expect(start.status).toBe(200);
  const { path, token } = await start.json();
  const { error } = await browser.storage.from("invitation-photos").uploadToSignedUrl(path, token, blob, { contentType: blob.type });
  return { path, uploadError: error };
}

async function confirm(event: string, path: string) {
  const res = await confirmUpload(coupleRequest("/api/couple/invitation/photo/confirm", event, { path }), { params: {} });
  return { status: res.status, body: await res.json() };
}

async function exists(path: string) {
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await admin.storage.from("invitation-photos").list(folder, { search: name });
  return (data ?? []).some((f) => f.name === name);
}

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Photo Upload Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: events } = await admin
    .from("events")
    .insert([
      { venue_id: venueId, couple_names: "Photo & One", event_date: "2027-11-01" },
      { venue_id: venueId, couple_names: "Photo & Two", event_date: "2027-11-02" },
    ])
    .select("id");
  [eventId, otherEventId] = events!.map((e) => e.id);
  await admin.from("event_invitations").insert({ event_id: eventId, template_id: "romantic-floral", public_slug: `photo${Date.now()}`.slice(0, 20) });
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await drainStorageCleanupQueue();
});

describe("invitation photo upload (SEC-005)", () => {
  it("accepts a 20 MB phone photo, stores it under a sniffed extension and serves it", { timeout: 60_000 }, async () => {
    const big = new Uint8Array(20 * 1024 * 1024);
    big.set(JPEG_HEAD);
    const { path, uploadError } = await uploadAs(eventId, new Blob([big], { type: "image/jpeg" }));
    expect(uploadError).toBeNull();

    const { status, body } = await confirm(eventId, path);
    expect(status).toBe(200);
    expect(body.photo_path).toMatch(new RegExp(`^${eventId}-\\d+\\.jpg$`));
    expect(await exists(path)).toBe(false); // moved out of the staging area

    const { data: inv } = await admin.from("event_invitations").select("photo_path").eq("event_id", eventId).single();
    expect(inv!.photo_path).toBe(body.photo_path);
    const res = await fetch(admin.storage.from("invitation-photos").getPublicUrl(body.photo_path).data.publicUrl, { method: "HEAD" });
    expect(res.status).toBe(200);
  });

  it("refuses an SVG at the bucket and an HTML file renamed to .jpg at confirm, leaving nothing behind", async () => {
    const svg = await uploadAs(eventId, new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], { type: "image/svg+xml" }));
    expect(svg.uploadError).not.toBeNull();
    expect(await exists(svg.path)).toBe(false);

    const html = await uploadAs(eventId, new Blob(["<!doctype html><script>alert(1)</script>"], { type: "image/jpeg" }));
    expect(html.uploadError).toBeNull();
    const { status, body } = await confirm(eventId, html.path);
    expect(status).toBe(400);
    expect(body.error).toMatch(/не е поддржана слика/);
    expect(await exists(html.path)).toBe(false);
  });

  it("replacing the photo deletes the previous one", async () => {
    const first = await uploadAs(eventId, new Blob([Uint8Array.from(JPEG_HEAD)], { type: "image/jpeg" }));
    const firstPath = (await confirm(eventId, first.path)).body.photo_path;
    await new Promise((r) => setTimeout(r, 5));
    const second = await uploadAs(eventId, new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }));
    const secondPath = (await confirm(eventId, second.path)).body.photo_path;
    expect(secondPath).toMatch(/\.png$/);
    expect(await exists(firstPath)).toBe(false);
    expect(await exists(secondPath)).toBe(true);
  });

  it("will not attach another event's upload", async () => {
    const theirs = await uploadAs(otherEventId, new Blob([Uint8Array.from(JPEG_HEAD)], { type: "image/jpeg" }));
    const { status } = await confirm(eventId, theirs.path);
    expect(status).toBe(400);
    expect(await exists(theirs.path)).toBe(true); // untouched
    await admin.storage.from("invitation-photos").remove([theirs.path]);
  });
});
