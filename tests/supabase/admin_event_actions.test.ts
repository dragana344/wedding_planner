import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { eventActionCore } from "@/lib/admin/event-actions-core";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad01", requestId: "req-admin" };
let venueId: string;
let eventId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: "Event Action Venue" }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "EA & Test", event_date: "2028-08-01" }).select("id").single()).data!.id;
  await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `ea-${Date.now()}`, p_password: "long-enough-55" });
});
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("admin event actions", () => {
  it("updates date, times and status, and audits venueId+eventId", async () => {
    const r = await eventActionCore.update({ eventId, date: "2028-08-02", startTime: "18:00", endTime: "01:00", status: "confirmed" }, ctx);
    expect((await admin.from("events").select("event_date, start_time, end_time, status").eq("id", eventId).single()).data).toEqual({
      event_date: "2028-08-02",
      start_time: "18:00:00",
      end_time: "01:00:00",
      status: "confirmed",
    });
    expect(r.audit).toMatchObject({ action: "admin_event_updated", eventId, venueId });
  });

  it("refuses to update an event that doesn't exist", async () => {
    const missingId = "22222222-3333-4000-8000-444444444444";
    await expect(
      eventActionCore.update({ eventId: missingId, date: "2028-08-02", startTime: null, endTime: null, status: "confirmed" }, ctx)
    ).rejects.toThrow("Настанот не постои.");
  });

  it("grants an extra benefit to one event and audits ids only (no free text)", async () => {
    const r = await eventActionCore.saveOverride({ eventId, featureKey: "seating", enabled: true, limitOverride: false, limitValue: null, note: "договор 12.10" }, ctx);
    expect(r.audit).toMatchObject({ action: "admin_event_override_saved", eventId, venueId, details: { feature: "seating", enabled: true, limit_override: false, limit: null } });
    expect((await admin.rpc("event_has_feature", { p_event_id: eventId, p_key: "seating" })).data).toBe(true);
  });

  it("clears an override when enabled is null and there is no limit override", async () => {
    await eventActionCore.saveOverride({ eventId, featureKey: "seating", enabled: null, limitOverride: false, limitValue: null, note: null }, ctx);
    expect((await admin.from("event_feature_overrides").select("*").eq("event_id", eventId).eq("feature_key", "seating")).data).toEqual([]);
  });

  it("clamps a limit override on a switch feature server-side", async () => {
    const r = await eventActionCore.saveOverride({ eventId, featureKey: "seating", enabled: true, limitOverride: true, limitValue: 999, note: null }, ctx);
    expect(r.audit).toMatchObject({ details: { limit_override: false, limit: null } });
    const { data } = await admin.from("event_feature_overrides").select("limit_override, limit_value").eq("event_id", eventId).eq("feature_key", "seating").single();
    expect(data).toEqual({ limit_override: false, limit_value: null });
    await admin.from("event_feature_overrides").delete().eq("event_id", eventId).eq("feature_key", "seating");
  });

  it("refuses venue-scope features on an event", async () => {
    await expect(
      eventActionCore.saveOverride({ eventId, featureKey: "reservations" as never, enabled: true, limitOverride: false, limitValue: null, note: null }, ctx)
    ).rejects.toThrow();
  });

  it("refuses to save an override for an event that doesn't exist", async () => {
    const missingId = "22222222-3333-4000-8000-444444444444";
    await expect(
      eventActionCore.saveOverride({ eventId: missingId, featureKey: "seating", enabled: true, limitOverride: false, limitValue: null, note: null }, ctx)
    ).rejects.toThrow("Настанот не постои.");
  });

  it("unlocks the couple login after failed attempts", async () => {
    await admin.from("event_credentials").update({ failed_attempts: 4, locked_until: new Date(Date.now() + 60_000).toISOString() }).eq("event_id", eventId);
    const r = await eventActionCore.unlockCouple({ eventId }, ctx);
    expect(r.audit).toMatchObject({ action: "admin_couple_login_unlocked", eventId, venueId });
    const { data } = await admin.from("event_credentials").select("failed_attempts, locked_until").eq("event_id", eventId).single();
    expect(data).toEqual({ failed_attempts: 0, locked_until: null });
  });

  it("regenerates the couple password (>=10 chars), ends couple sessions, and never audits the password", async () => {
    const before = (await admin.from("event_credentials").select("password_hash").eq("event_id", eventId).single()).data!.password_hash;
    // Sits in for a live couple session: regenerate_event_password (0045) must delete it.
    await admin.from("couple_sessions").insert({ event_id: eventId, token: `tok-${Date.now()}`, expires_at: new Date(Date.now() + 60_000).toISOString() });

    const r = await eventActionCore.regenerateCouplePassword({ eventId }, ctx);
    expect(r.data.password.length).toBeGreaterThanOrEqual(10);
    expect(r.audit).toMatchObject({ action: "admin_couple_password_regenerated", eventId, venueId });
    expect(JSON.stringify(r.audit)).not.toContain(r.data.password);

    const after = (await admin.from("event_credentials").select("password_hash").eq("event_id", eventId).single()).data!.password_hash;
    expect(after).not.toBe(before);
    expect((await admin.from("couple_sessions").select("*").eq("event_id", eventId)).data).toEqual([]);
  });

  it("refuses couple-access actions for an event that doesn't exist", async () => {
    const missingId = "22222222-3333-4000-8000-444444444444";
    await expect(eventActionCore.unlockCouple({ eventId: missingId }, ctx)).rejects.toThrow("Настанот не постои.");
    await expect(eventActionCore.regenerateCouplePassword({ eventId: missingId }, ctx)).rejects.toThrow("Настанот не постои.");
  });
});
