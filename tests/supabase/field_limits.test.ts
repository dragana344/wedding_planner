import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// DATA-009: even the service role (i.e. a bug that skips API validation)
// cannot store oversized or empty values.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let venueId: string;
let eventId: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Limits Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "Limits & Test", event_date: "2026-12-05" })
    .select("id")
    .single();
  eventId = event!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

const CHECK_VIOLATION = "23514";

describe("database field limits (DATA-009)", () => {
  it("rejects a 1 MB note", async () => {
    const { error } = await admin.from("event_notes").insert({ event_id: eventId, content: "x".repeat(1_000_000) });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("rejects an empty or whitespace-only guest name, and an oversized party", async () => {
    expect((await admin.from("event_guests").insert({ event_id: eventId, full_name: "   " })).error?.code).toBe(CHECK_VIOLATION);
    expect((await admin.from("event_guests").insert({ event_id: eventId, full_name: "Ana", party_size: 101 })).error?.code).toBe(
      CHECK_VIOLATION,
    );
  });

  it("rejects an oversized public contact message", async () => {
    const { error } = await admin
      .from("contact_submissions")
      .insert({ name: "Spam", email: "spam@example.com", message: "x".repeat(20_000) });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("still accepts realistic values", async () => {
    const { error } = await admin
      .from("event_guests")
      .insert({ event_id: eventId, full_name: "Ана Петровска", party_size: 4, phone: "+389 70 123 456", notes: "Вегетаријанка" });
    expect(error).toBeNull();
    const { error: noteError } = await admin.from("event_notes").insert({ event_id: eventId, title: "Цвеќиња", content: "a".repeat(5000) });
    expect(noteError).toBeNull();
  });
});
