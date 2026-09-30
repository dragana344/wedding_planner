import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createCoupleSession, validateAndRenewCoupleSession } from "@/lib/couple/session-token";
import { generateRandomPassword } from "@/lib/venue/credentials";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let venueId: string;
let eventId: string;
let otherEventId: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Credentials Policy Venue" }).select("id").single();
  venueId = venue!.id;
  const events = await admin
    .from("events")
    .insert([
      { venue_id: venueId, couple_names: "Policy & One", event_date: "2026-12-10" },
      { venue_id: venueId, couple_names: "Policy & Two", event_date: "2026-12-11" },
    ])
    .select("id");
  [eventId, otherEventId] = events.data!.map((e) => e.id);
  await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: "policy-one", p_password: "long-enough-1" });
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("couple password minimum (SEC-027)", () => {
  it("refuses a password under 10 characters when creating or regenerating", async () => {
    const created = await admin.rpc("create_event_credentials", { p_event_id: otherEventId, p_username: "policy-two", p_password: "1234" });
    expect(created.error?.message).toMatch(/најмалку 10 знаци/);
    const regenerated = await admin.rpc("regenerate_event_password", { p_event_id: eventId, p_password: "short" });
    expect(regenerated.error?.message).toMatch(/најмалку 10 знаци/);
  });

  it("the panel's generator always satisfies the rule", () => {
    for (let i = 0; i < 2000; i++) expect(generateRandomPassword().length).toBeGreaterThanOrEqual(10);
  });
});

describe("regenerating the password ends couple sessions (SEC-009)", () => {
  it("rejects every existing session of that event, and only that event", async () => {
    const mine = await createCoupleSession(eventId);
    const other = await createCoupleSession(otherEventId);
    expect(await validateAndRenewCoupleSession(mine.token)).not.toBeNull();

    const { error } = await admin.rpc("regenerate_event_password", { p_event_id: eventId, p_password: "a-fresh-password" });
    expect(error).toBeNull();

    expect(await validateAndRenewCoupleSession(mine.token)).toBeNull();
    expect(await validateAndRenewCoupleSession(other.token)).not.toBeNull();
  });
});
