// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runMediaRetention } from "@/lib/media/retention";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// C6: after the album's retention period the guests' media are deleted; the
// couple is told five days before. Dates are in 2019 so no other test file's
// events (all later) fall inside the sweep while it runs in parallel.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const NOW = new Date("2019-03-02T10:00:00Z");
let venueId: string;
const ids: Record<string, string> = {};

async function seed(key: string, eventDate: string, email: string | null) {
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: `Retention ${key}`, event_date: eventDate, contact_email: email })
    .select("id")
    .single();
  ids[key] = event!.id;
  await admin.from("event_albums").insert({ event_id: event!.id, public_token: `retention-${key}-${Date.now()}`.padEnd(24, "x") });
  await admin.from("event_photos").insert({
    event_id: event!.id, storage_path: `${event!.id}/photos/r.jpg`, bytes: 10, mime: "image/jpeg", consent_at: NOW.toISOString(),
  });
  await admin.from("event_greetings").insert({ event_id: event!.id, first_name: "А", last_name: "Б", message: "Честито" });
}

async function mediaCount(eventId: string) {
  const photos = await admin.from("event_photos").select("*", { count: "exact", head: true }).eq("event_id", eventId);
  const greetings = await admin.from("event_greetings").select("*", { count: "exact", head: true }).eq("event_id", eventId);
  return (photos.count ?? 0) + (greetings.count ?? 0);
}

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Retention Venue" }).select("id").single();
  venueId = venue!.id;
  await seed("expired", "2018-12-31", "old@couple.test"); // 61 days before NOW
  await seed("soon", "2019-01-03", "soon@couple.test"); // 58 days before NOW: deletion on 04.03.2019
  await seed("recent", "2019-02-20", "new@couple.test"); // 10 days before NOW
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await drainStorageCleanupQueue();
});

describe("runMediaRetention", () => {
  it("does nothing until a retention period is configured", async () => {
    expect(await runMediaRetention({ days: null, now: NOW })).toEqual({ skipped: true });
    expect(await mediaCount(ids.expired)).toBe(2);
  });

  it("warns once before deletion, deletes expired media and leaves recent albums alone", async () => {
    const notify = vi.fn(async () => {});
    const first = await runMediaRetention({ days: 60, now: NOW, notify });
    expect(first).toMatchObject({ noticed: 1, purgedEvents: 1 });
    expect(notify).toHaveBeenCalledWith("soon@couple.test", "Retention soon", "04.03.2019");

    expect(await mediaCount(ids.expired)).toBe(0);
    expect(await mediaCount(ids.soon)).toBe(2);
    expect(await mediaCount(ids.recent)).toBe(2);
    const { data: audit } = await admin.from("audit_log").select("details").eq("event_id", ids.expired).eq("action", "event_media_purged");
    expect(audit).toEqual([{ details: { photos: 1, greetings: 1 } }]);

    const second = await runMediaRetention({ days: 60, now: NOW, notify });
    expect(second).toMatchObject({ noticed: 0, purgedEvents: 0 });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
