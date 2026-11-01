// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listEventChanges, getSeen, markSeen, getCoupleFirstLogin, coupleChangerName } from "@/lib/changes/server";

// Server data access for change marks (0125 tables, 0126 mark_change_seen).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let eventId: string;

beforeAll(async () => {
  const v = await admin.from("venues").insert({ name: `ChangeServer ${stamp}` }).select("id").single();
  if (v.error) throw v.error;
  venueId = v.data.id;
  const e = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "Ана и Марко", event_date: "2030-06-01", guest_count_estimate: 100 })
    .select("id")
    .single();
  if (e.error) throw e.error;
  eventId = e.data.id;
}, 30_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("listEventChanges", () => {
  it("returns mapped changes oldest first, and only those after `since`", async () => {
    await admin.from("events").update({ guest_count_estimate: 110 }).eq("id", eventId);
    await admin.from("events").update({ guest_count_estimate: 120 }).eq("id", eventId);
    const all = await listEventChanges(eventId);
    expect(all.map((c) => c.newValue)).toEqual([{ count: 110 }, { count: 120 }]);
    expect(all[0]).toMatchObject({ eventId, section: "guest_count", side: "venue", changedBy: null, field: "guest_count", oldValue: { count: 100 } });
    const later = await listEventChanges(eventId, all[0].changedAt);
    expect(later.map((c) => c.id)).toEqual([all[1].id]);
  });
});

describe("markSeen / getSeen", () => {
  it("is empty before anything is seen", async () => {
    expect(await getSeen(eventId, "couple")).toEqual({});
  });

  it("keeps the greater position when called with an older upTo", async () => {
    await markSeen(eventId, "couple", "guest_count", "2030-01-10T10:00:00.000Z", "Младенците");
    await markSeen(eventId, "couple", "guest_count", "2030-01-09T10:00:00.000Z", "Ко-организатор");
    const seen = await getSeen(eventId, "couple");
    expect(Date.parse(seen.guest_count!)).toBe(Date.parse("2030-01-10T10:00:00.000Z"));
    const row = await admin.from("event_change_seen").select("seen_by").eq("event_id", eventId).eq("viewer", "couple").eq("section", "guest_count").single();
    expect(row.data?.seen_by).toBe("Младенците");
  });

  it("moves forward for a newer upTo, per viewer and section", async () => {
    await markSeen(eventId, "couple", "guest_count", "2030-01-11T10:00:00.000Z", null);
    await markSeen(eventId, "couple", "menu_numbers", "2030-01-05T10:00:00.000Z", null);
    const seen = await getSeen(eventId, "couple");
    expect(Date.parse(seen.guest_count!)).toBe(Date.parse("2030-01-11T10:00:00.000Z"));
    expect(Date.parse(seen.menu_numbers!)).toBe(Date.parse("2030-01-05T10:00:00.000Z"));
    expect(await getSeen(eventId, "venue")).toEqual({});
  });

  it("rejects an unknown section", async () => {
    await expect(markSeen(eventId, "couple", "bogus" as never, "2030-01-11T10:00:00.000Z", null)).rejects.toThrow();
  });
});

describe("getCoupleFirstLogin", () => {
  it("is null until the couple first logs in, then the recorded time", async () => {
    expect(await getCoupleFirstLogin(eventId)).toBeNull();
    await admin.rpc("record_couple_first_login", { p_event_id: eventId });
    expect(await getCoupleFirstLogin(eventId)).not.toBeNull();
  });
});

describe("coupleChangerName", () => {
  it("names the main login the couple and anyone else a co-organizer", () => {
    expect(coupleChangerName(null)).toBe("Младенците");
    expect(coupleChangerName("bride")).toBe("Ко-организатор");
    expect(coupleChangerName("groom")).toBe("Ко-организатор");
  });
});
