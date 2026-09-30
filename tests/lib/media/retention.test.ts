// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runMediaRetention, type RetentionNotify } from "@/lib/media/retention";
import { getAlbumByToken } from "@/lib/media/album";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// C6: after the album's retention period the guests' media are deleted; the
// couple is always told at least five days before. The sweep is global and other test files'
// old events (e.g. privacy.test's 1920/1990) may be swept alongside, so the
// assertions look at this file's events only.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const NOW = new Date("2019-03-02T10:00:00Z");
let venueId: string;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};

async function seed(key: string, eventDate: string, email: string | null) {
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: `Retention ${key}`, event_date: eventDate, contact_email: email })
    .select("id")
    .single();
  ids[key] = event!.id;
  tokens[key] = `retention-${key}-${Date.now()}`.padEnd(24, "x");
  await admin.from("event_albums").insert({ event_id: event!.id, public_token: tokens[key] });
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

  it("never deletes an album whose couple wasn't warned: warns first, deletes five days later", async () => {
    const notify = vi.fn<RetentionNotify>(async () => {});
    const ours = new Set(["old@couple.test", "soon@couple.test", "new@couple.test"]);
    const mine = () => notify.mock.calls.filter(([to]) => ours.has(to)).map(([to, , on]) => [to, on]);

    await runMediaRetention({ days: 60, now: NOW, notify });
    // Past its date but never warned ("expired") and due in two days ("soon"): both are warned
    // with a deletion date at least five days out, and nothing is deleted yet.
    expect(mine().sort()).toEqual([["old@couple.test", "07.03.2019"], ["soon@couple.test", "07.03.2019"]]);
    expect(await mediaCount(ids.expired)).toBe(2);
    expect(await mediaCount(ids.soon)).toBe(2);

    // An hour later nobody is warned twice; on 06.03 still nothing is deleted.
    await runMediaRetention({ days: 60, now: new Date(NOW.getTime() + 3600_000), notify });
    await runMediaRetention({ days: 60, now: new Date("2019-03-06T10:00:00Z"), notify });
    expect(mine()).toHaveLength(2);
    expect(await mediaCount(ids.expired)).toBe(2);

    // On the promised day both go; the recent album stays.
    await runMediaRetention({ days: 60, now: new Date("2019-03-07T10:00:00Z"), notify });
    expect(await mediaCount(ids.expired)).toBe(0);
    expect(await mediaCount(ids.soon)).toBe(0);
    expect(await mediaCount(ids.recent)).toBe(2);
    const { data: audit } = await admin.from("audit_log").select("details").eq("event_id", ids.expired).eq("action", "event_media_purged");
    expect(audit).toEqual([{ details: { photos: 1, greetings: 1 } }]);
  });

  it("closes a purged album: its link stops working and later runs skip it", async () => {
    const { count } = await admin.from("event_albums").select("*", { count: "exact", head: true }).in("event_id", [ids.expired, ids.soon]);
    expect(count).toBe(0);
    expect(await getAlbumByToken(tokens.expired)).toBeNull();
  });

  it("carries on when one couple's warning email fails", async () => {
    await seed("failing", "2019-01-05", "fails@couple.test");
    await seed("fine", "2019-01-05", "fine@couple.test");
    const sent: string[] = [];
    const notify = vi.fn<RetentionNotify>(async (to) => {
      if (to === "fails@couple.test") throw new Error("Resend responded 500");
      sent.push(to);
    });
    await runMediaRetention({ days: 60, now: NOW, notify });
    expect(sent).toContain("fine@couple.test");
    // The failed warning is retried next time rather than marked as sent.
    const { data } = await admin.from("event_albums").select("retention_notice_sent_at").eq("event_id", ids.failing).single();
    expect(data!.retention_notice_sent_at).toBeNull();
  });
});
