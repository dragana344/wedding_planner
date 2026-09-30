// tests/lib/couple/session.test.ts
// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createCoupleSession, validateAndRenewCoupleSession, deleteCoupleSession } from "@/lib/couple/session-token";
import { hashSessionToken } from "@/lib/couple/session-hash";

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
      .eq("token", await hashSessionToken(session.token))
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
      token: await hashSessionToken("expired-test-token"),
      event_id: eventId,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await validateAndRenewCoupleSession("expired-test-token")).toBeNull();
    await admin.from("couple_sessions").delete().eq("token", await hashSessionToken("expired-test-token"));
  });

  describe("hashing at rest (SEC-008)", () => {
    it("stores only the SHA-256 of the token, never the token itself", async () => {
      const { token } = await createCoupleSession(eventId);
      const { data: raw } = await admin.from("couple_sessions").select("token").eq("token", token);
      expect(raw).toEqual([]);
      const { data: hashed } = await admin.from("couple_sessions").select("token").eq("token", await hashSessionToken(token));
      expect(hashed).toHaveLength(1);
      expect(hashed![0].token).toMatch(/^[0-9a-f]{64}$/);
      await deleteCoupleSession(token);
    });

    it("does not accept the stored hash itself as a cookie", async () => {
      const { token } = await createCoupleSession(eventId);
      expect(await validateAndRenewCoupleSession(await hashSessionToken(token))).toBeNull();
      await deleteCoupleSession(token);
    });

    it("hashes exactly like migration 0032 does in Postgres, so migrated sessions stay valid", async () => {
      const db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
      await db.connect();
      try {
        const token = "a".repeat(64);
        const { rows } = await db.query("select encode(extensions.digest($1::text, 'sha256'), 'hex') as h", [token]);
        expect(rows[0].h).toBe(await hashSessionToken(token));
      } finally {
        await db.end();
      }
    });
  });

  describe("renewal throttling (SEC-008)", () => {
    async function sessionExpiringIn(days: number, token: string) {
      const expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await admin.from("couple_sessions").insert({ token: await hashSessionToken(token), event_id: eventId, expires_at });
      return expires_at;
    }
    async function storedExpiry(token: string) {
      const { data } = await admin.from("couple_sessions").select("expires_at").eq("token", await hashSessionToken(token)).single();
      return new Date(data!.expires_at).getTime();
    }

    it("does not write when the session was renewed within the last day", async () => {
      const before = await sessionExpiringIn(29.5, "fresh-session-token");
      expect(await validateAndRenewCoupleSession("fresh-session-token")).not.toBeNull();
      expect(await storedExpiry("fresh-session-token")).toBe(new Date(before).getTime());
      await deleteCoupleSession("fresh-session-token");
    });

    it("slides the expiry back to 30 days once more than a day has passed", async () => {
      await sessionExpiringIn(20, "older-session-token");
      expect(await validateAndRenewCoupleSession("older-session-token")).not.toBeNull();
      const days = ((await storedExpiry("older-session-token")) - Date.now()) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThan(29.9);
      await deleteCoupleSession("older-session-token");
    });
  });
});
