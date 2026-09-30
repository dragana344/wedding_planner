// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getAlbumByToken, getOrCreateAlbumToken, getStorageUsage, QUOTA_FULL_ERROR, assertQuotaFor } from "@/lib/media/album";
import { DEFAULT_STORAGE_BYTES } from "@/lib/media/limits";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let venueId: string;
let eventId: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Album Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: room } = await admin.from("rooms").insert({ venue_id: venueId, name: "Кристал" }).select("id").single();
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "Ана и Марко", event_date: "2027-06-12" })
    .select("id")
    .single();
  eventId = event!.id;
  await admin.from("event_rooms").insert({ event_id: eventId, room_id: room!.id });
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("album token", () => {
  it("creates one unguessable token per event and keeps it", async () => {
    const token = await getOrCreateAlbumToken(eventId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(await getOrCreateAlbumToken(eventId)).toBe(token);
  });

  it("resolves the token to the event's names, date and venue", async () => {
    const token = await getOrCreateAlbumToken(eventId);
    expect(await getAlbumByToken(token)).toEqual({
      eventId, coupleNames: "Ана и Марко", eventDate: "2027-06-12", venueName: "Album Venue",
    });
  });

  it("returns null for an unknown token", async () => {
    expect(await getAlbumByToken("x".repeat(24))).toBeNull();
  });
});

describe("storage quota", () => {
  it("reports usage against the default limit", async () => {
    await admin.from("event_photos").insert({
      event_id: eventId, storage_path: `${eventId}/photos/q1.jpg`, bytes: 3000, mime: "image/jpeg", consent_at: new Date().toISOString(),
    });
    expect(await getStorageUsage(eventId)).toEqual({ limitBytes: DEFAULT_STORAGE_BYTES, photoBytes: 3000, videoBytes: 0 });
  });

  it("refuses bytes that would go over the limit", async () => {
    await expect(assertQuotaFor(eventId, DEFAULT_STORAGE_BYTES - 3000)).resolves.toBeUndefined();
    await expect(assertQuotaFor(eventId, DEFAULT_STORAGE_BYTES - 2999)).rejects.toThrow(QUOTA_FULL_ERROR);
  });
});
