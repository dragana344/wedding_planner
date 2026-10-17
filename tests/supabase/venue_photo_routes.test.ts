import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 0107 + the signed-upload routes: event showcase photos are added and
// removed only by a manager (the venue logo only by the owner), through a
// one-time signed upload the server then checks — never directly from a
// staff session, and never for another venue's event.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const EMAIL = `venue-photos-${stamp}@test.local`;
const PASSWORD = "staff-password-123";
const BUCKET = "event-showcase-photos";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

let venueId: string;
let otherVenueId: string;
let userId: string;
let eventId: string;
let otherEventId: string;
let ownerToken: string;
let managerToken: string;
let staffClient: SupabaseClient;

vi.mock("@/lib/supabase/server", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  return {
    createServerSupabaseClient: async () => {
      const c = create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      return c;
    },
  };
});

import { POST as startShowcase } from "@/app/api/venue/events/[eventId]/showcase/route";
import { POST as confirmShowcase } from "@/app/api/venue/events/[eventId]/showcase/confirm/route";
import { DELETE as deleteShowcase } from "@/app/api/venue/events/[eventId]/showcase/[photoId]/route";
import { POST as startLogo } from "@/app/api/venue/settings/logo/route";
import { POST as confirmLogo } from "@/app/api/venue/settings/logo/confirm/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";
import * as venueProfile from "@/lib/venue/venue-profile";

function req(path: string, method: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return new NextRequest(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const eventCtx = (eventId: string) => ({ params: Promise.resolve({ eventId }) });
const photoCtx = (eventId: string, photoId: string) => ({ params: Promise.resolve({ eventId, photoId }) });
const NO_PARAMS = { params: Promise.resolve({}) };

/** Steps 1 and 2 of a showcase upload, with the browser's direct upload in between. */
async function uploadShowcase(bytes: Buffer, token = managerToken, forEvent = eventId) {
  const start = await startShowcase(req(`/api/venue/events/${forEvent}/showcase`, "POST", token), eventCtx(forEvent));
  if (start.status !== 200) return start;
  const { path, token: uploadToken } = await start.json();
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const put = await anon.storage.from(BUCKET).uploadToSignedUrl(path, uploadToken, bytes, { contentType: "image/png" });
  expect(put.error).toBeNull();
  return confirmShowcase(req(`/api/venue/events/${forEvent}/showcase/confirm`, "POST", token, { path }), eventCtx(forEvent));
}

async function exists(path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const { data } = await admin.storage.from(BUCKET).list(folder, { search: path.slice(path.lastIndexOf("/") + 1) });
  return (data ?? []).length > 0;
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Photos ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Photos Other ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Пар", event_date: "2027-06-01" }).select("id").single()).data!.id;
  otherEventId = (await admin.from("events").insert({ venue_id: otherVenueId, couple_names: "Туѓ", event_date: "2027-06-01" }).select("id").single()).data!.id;

  const ownerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Сопственик", p_password: "owner-pass-1", p_is_owner: true })).data as string;
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-1", p_is_owner: false })).data as string;
  ownerToken = (await createManagerElevation(venueId, ownerId, "Сопственик", true)).token;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер", false)).token;

  staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
  await staffClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
}, 60_000);

afterAll(async () => {
  const { data: files } = await admin.storage.from(BUCKET).list(venueId, { limit: 100 });
  if (files?.length) await admin.storage.from(BUCKET).remove(files.map((f) => `${venueId}/${f.name}`));
  await admin.from("storage_cleanup_queue").delete().like("path", `${venueId}/%`);
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

describe("showcase photos", () => {
  it("a manager uploads one: it is checked, renamed by its real type and recorded", async () => {
    const res = await uploadShowcase(PNG);
    expect(res.status).toBe(200);
    const photo = await res.json();
    expect(photo.event_id).toBe(eventId);
    expect(photo.photo_path).toMatch(new RegExp(`^${venueId}/${eventId}-\\d+\\.png$`));
    expect(await exists(photo.photo_path)).toBe(true);
  });

  it("refuses a file that isn't an image and deletes it", async () => {
    const start = await startShowcase(req(`/api/venue/events/${eventId}/showcase`, "POST", managerToken), eventCtx(eventId));
    const { path, token } = await start.json();
    await createClient(url, anonKey).storage.from(BUCKET).uploadToSignedUrl(path, token, Buffer.from("<html>hi</html>"), { contentType: "image/png" });
    const res = await confirmShowcase(req(`/api/venue/events/${eventId}/showcase/confirm`, "POST", managerToken, { path }), eventCtx(eventId));
    expect(res.status).toBe(400);
    expect(await exists(path)).toBe(false);
  });

  it("refuses plain staff, and another venue's event", async () => {
    expect((await startShowcase(req(`/api/venue/events/${eventId}/showcase`, "POST"), eventCtx(eventId))).status).toBe(403);
    expect((await startShowcase(req(`/api/venue/events/${otherEventId}/showcase`, "POST", managerToken), eventCtx(otherEventId))).status).toBe(404);
  });

  it("refuses confirming an upload path outside the venue's pending folder", async () => {
    const res = await confirmShowcase(
      req(`/api/venue/events/${eventId}/showcase/confirm`, "POST", managerToken, { path: `pending/${otherVenueId}/00000000-0000-0000-0000-000000000000` }),
      eventCtx(eventId),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Неважечко прикачување.");
  });

  it("a manager removes one; staff and other events cannot", async () => {
    const photo = (await admin.from("event_showcase_photos").select("id").eq("event_id", eventId).limit(1).single()).data!;
    const path = (id: string) => `/api/venue/events/${id}/showcase/${photo.id}`;
    expect((await deleteShowcase(req(path(eventId), "DELETE"), photoCtx(eventId, photo.id))).status).toBe(403);
    expect((await deleteShowcase(req(path(otherEventId), "DELETE", managerToken), photoCtx(otherEventId, photo.id))).status).toBe(404);
    expect((await deleteShowcase(req(path(eventId), "DELETE", managerToken), photoCtx(eventId, photo.id))).status).toBe(200);
    expect((await admin.from("event_showcase_photos").select("id").eq("id", photo.id)).data).toEqual([]);
  });
});

describe("venue logo (two-step upload)", () => {
  it("the owner uploads it; a non-owner manager cannot start one", async () => {
    expect((await startLogo(req("/api/venue/settings/logo", "POST", managerToken), NO_PARAMS)).status).toBe(403);
    const start = await startLogo(req("/api/venue/settings/logo", "POST", ownerToken), NO_PARAMS);
    expect(start.status).toBe(200);
    const { path, token } = await start.json();
    await createClient(url, anonKey).storage.from(BUCKET).uploadToSignedUrl(path, token, PNG, { contentType: "image/png" });
    expect((await confirmLogo(req("/api/venue/settings/logo/confirm", "POST", managerToken, { path }), NO_PARAMS)).status).toBe(403);
    const res = await confirmLogo(req("/api/venue/settings/logo/confirm", "POST", ownerToken, { path }), NO_PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain(`${venueId}/logo-`);
    const { data: venue } = await admin.from("venues").select("logo_path").eq("id", venueId).single();
    expect(venue!.logo_path).toMatch(new RegExp(`^${venueId}/logo-\\d+\\.png$`));
  });

  it("deletes the just-moved file instead of leaving it orphaned when recording it fails (final review finding — showcase photos already did this, the logo route didn't)", async () => {
    const before = await admin.storage.from(BUCKET).list(venueId);
    const namesBefore = new Set((before.data ?? []).map((f) => f.name));

    const start = await startLogo(req("/api/venue/settings/logo", "POST", ownerToken), NO_PARAMS);
    const { path, token } = await start.json();
    await createClient(url, anonKey).storage.from(BUCKET).uploadToSignedUrl(path, token, PNG, { contentType: "image/png" });
    vi.spyOn(venueProfile, "setVenueLogoPath").mockRejectedValueOnce(new Error("db hiccup"));

    const res = await confirmLogo(req("/api/venue/settings/logo/confirm", "POST", ownerToken, { path }), NO_PARAMS);
    expect(res.status).toBe(400);

    // The uploaded file was moved to its final <venueId>/logo-<ts>.png name
    // before setVenueLogoPath ran; that file must not survive the failure —
    // compared against the folder's contents before this test's own upload,
    // since an earlier test in this file already left a real logo behind.
    const { data: after } = await admin.storage.from(BUCKET).list(venueId);
    const newFiles = (after ?? []).filter((f) => !namesBefore.has(f.name));
    expect(newFiles).toEqual([]);
  });
});

describe("0107 — staff cannot change photos directly", () => {
  it("refuses direct inserts and deletes of showcase rows", async () => {
    const { error } = await staffClient.from("event_showcase_photos").insert({ event_id: eventId, photo_path: `${venueId}/${eventId}-1.png` });
    expect(error).not.toBeNull();
    const before = (await admin.from("event_showcase_photos").select("id").eq("event_id", eventId)).data!.length;
    await staffClient.from("event_showcase_photos").delete().eq("event_id", eventId);
    expect((await admin.from("event_showcase_photos").select("id").eq("event_id", eventId)).data).toHaveLength(before);
  });

  it("refuses uploading into the venue's folder", async () => {
    const { error } = await staffClient.storage.from(BUCKET).upload(`${venueId}/sneaky-${stamp}.png`, PNG, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("still lets staff read their showcase rows", async () => {
    const { error } = await staffClient.from("event_showcase_photos").select("id").eq("event_id", eventId);
    expect(error).toBeNull();
  });
});
