// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

// 0080 (Session 4): guest photos, greetings and the album token. Service role
// only; files in the private event-media bucket follow their rows through the
// 0038 cleanup queue, and an event's erasure takes its media with it.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
let db: Client;
let venueId: string;
let eventId: string;

const now = () => new Date().toISOString();

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  const { data: v } = await admin.from("venues").insert({ name: "Media Venue" }).select("id").single();
  venueId = v!.id;
  const { data: e } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "M & M", event_date: "2027-07-01" })
    .select("id")
    .single();
  eventId = e!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("storage_cleanup_queue").delete().eq("bucket", "event-media").like("path", `${eventId}/%`);
  await db.end();
});

describe("0080 event media", () => {
  it("has a private bucket with the media allow-list and a 100 MB cap", async () => {
    const { rows } = await db.query(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'event-media'",
    );
    expect(rows[0]).toEqual({
      public: false,
      file_size_limit: "104857600",
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"],
    });
  });

  it("keeps the tables closed to anon", async () => {
    for (const table of ["event_albums", "event_photos", "event_greetings"]) {
      const { error } = await anon.from(table).select("*").limit(1);
      expect(error, table).not.toBeNull();
    }
  });

  it("rejects a photo over 15 MB and a greeting over 1000 characters", async () => {
    const big = await admin.from("event_photos").insert({
      event_id: eventId, storage_path: `${eventId}/photos/big.jpg`, bytes: 15 * 1024 * 1024 + 1, mime: "image/jpeg", consent_at: now(),
    });
    expect(big.error).not.toBeNull();
    const long = await admin.from("event_greetings").insert({ event_id: eventId, first_name: "А", last_name: "Б", message: "x".repeat(1001) });
    expect(long.error).not.toBeNull();
  });

  it("sums photo and video bytes for the event", async () => {
    await admin.from("event_photos").insert({
      event_id: eventId, storage_path: `${eventId}/photos/u1.jpg`, bytes: 1000, mime: "image/jpeg", consent_at: now(),
    });
    await admin.from("event_greetings").insert({
      event_id: eventId, first_name: "Ана", last_name: "Петрова", message: "Честито!", video_path: `${eventId}/videos/v1.mp4`, video_bytes: 5000,
    });
    const { data, error } = await admin.rpc("event_media_usage", { p_event_id: eventId });
    expect(error).toBeNull();
    expect(data[0]).toMatchObject({ photo_bytes: 1000, video_bytes: 5000, photo_count: 1, greeting_count: 1 });
  });

  it("queues the file when a photo or greeting is deleted", async () => {
    await admin.from("event_photos").delete().eq("storage_path", `${eventId}/photos/u1.jpg`);
    await admin.from("event_greetings").delete().eq("video_path", `${eventId}/videos/v1.mp4`);
    const { data } = await admin
      .from("storage_cleanup_queue")
      .select("path")
      .eq("bucket", "event-media")
      .in("path", [`${eventId}/photos/u1.jpg`, `${eventId}/videos/v1.mp4`]);
    expect(data).toHaveLength(2);
  });

  it("removes the album, photos and greetings when the event's personal data is erased", async () => {
    await admin.from("event_albums").insert({ event_id: eventId, public_token: "t".repeat(24) });
    await admin.from("event_photos").insert({
      event_id: eventId, storage_path: `${eventId}/photos/u2.jpg`, bytes: 10, mime: "image/jpeg", consent_at: now(),
    });
    await admin.from("event_greetings").insert({ event_id: eventId, first_name: "Иван", last_name: "Иванов", message: "Среќно!" });
    const { error } = await admin.rpc("erase_event_personal_data", { p_event_id: eventId });
    expect(error).toBeNull();
    for (const table of ["event_albums", "event_photos", "event_greetings"]) {
      const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq("event_id", eventId);
      expect(count, table).toBe(0);
    }
  });
});
