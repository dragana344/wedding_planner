// tests/lib/couple/session.test.ts
// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createCoupleSession, validateAndRenewCoupleSession, deleteCoupleSession } from "@/lib/couple/session-token";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueId: string;
let eventId: string;

describe("couple session lib", () => {
  afterAll(async () => {
    if (venueId) await admin.from("venues").delete().eq("id", venueId);
  });

  it("creates a session with a ~30-day expiry, validates and renews it, then deletes it", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Session Lib Venue" }).select().single();
    venueId = venue!.id;
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venueId, couple_names: "Session & Test", event_date: "2026-11-20" })
      .select()
      .single();
    eventId = event!.id;

    const session = await createCoupleSession(eventId);
    expect(session.token.length).toBeGreaterThan(20);
    const daysUntilExpiry = (session.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntilExpiry).toBeGreaterThan(29);
    expect(daysUntilExpiry).toBeLessThan(31);

    const resolved = await validateAndRenewCoupleSession(session.token);
    expect(resolved?.eventId).toBe(eventId);

    const { data: row } = await admin
      .from("couple_sessions")
      .select("expires_at")
      .eq("token", session.token)
      .single();
    const renewedDays = (new Date(row!.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(renewedDays).toBeGreaterThan(29);

    await deleteCoupleSession(session.token);
    const afterDelete = await validateAndRenewCoupleSession(session.token);
    expect(afterDelete).toBeNull();
  });

  it("returns null for an unknown or expired token", async () => {
    expect(await validateAndRenewCoupleSession("no-such-token")).toBeNull();

    await admin.from("couple_sessions").insert({
      token: "expired-test-token",
      event_id: eventId,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await validateAndRenewCoupleSession("expired-test-token")).toBeNull();
    await admin.from("couple_sessions").delete().eq("token", "expired-test-token");
  });
});
