import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// 0060: personal invite links, richer RSVP answers (later / menu / children /
// comment) and invitation-sent tracking on event_guests.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let venueId: string;
let eventId: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "0060 Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "0060 Couple", event_date: "2027-03-01" })
    .select("id")
    .single();
  eventId = event!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const NOT_NULL_VIOLATION = "23502";

async function insertGuest(fields: Record<string, unknown> = {}) {
  return admin
    .from("event_guests")
    .insert({ event_id: eventId, full_name: "Гостин 0060", ...fields })
    .select("*")
    .single();
}

describe("0060 schema: personal invite tokens", () => {
  it("gives every new guest its own url-safe token of at least 22 characters", async () => {
    const { data: a, error } = await insertGuest();
    const { data: b } = await insertGuest();
    expect(error).toBeNull();
    expect(a!.invite_token).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(b!.invite_token).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(a!.invite_token).not.toBe(b!.invite_token);
  });

  it("rejects a duplicate, short, or missing token", async () => {
    const { data: a } = await insertGuest();
    expect((await insertGuest({ invite_token: a!.invite_token })).error?.code).toBe(UNIQUE_VIOLATION);
    expect((await insertGuest({ invite_token: "short" })).error?.code).toBe(CHECK_VIOLATION);
    expect((await insertGuest({ invite_token: "has spaces and is long enough!!" })).error?.code).toBe(CHECK_VIOLATION);
    expect((await insertGuest({ invite_token: null })).error?.code).toBe(NOT_NULL_VIOLATION);
  });
});

describe("0060 schema: RSVP answers", () => {
  it("accepts 'later' as a status and as the previous status", async () => {
    const { data, error } = await insertGuest({ rsvp_status: "later", rsvp_previous_status: "later" });
    expect(error).toBeNull();
    expect(data!.rsvp_status).toBe("later");
    expect((await insertGuest({ rsvp_status: "maybe" })).error?.code).toBe(CHECK_VIOLATION);
    expect((await insertGuest({ rsvp_previous_status: "maybe" })).error?.code).toBe(CHECK_VIOLATION);
  });

  it("stores a menu choice from the fixed list only", async () => {
    for (const choice of ["standard", "posno", "vegetarian", null]) {
      const { data, error } = await insertGuest({ menu_choice: choice });
      expect(error, String(choice)).toBeNull();
      expect(data!.menu_choice).toBe(choice);
    }
    expect((await insertGuest({ menu_choice: "vegan" })).error?.code).toBe(CHECK_VIOLATION);
  });

  it("defaults children to 0 and rejects a negative or absurd count", async () => {
    const { data } = await insertGuest();
    expect(data!.children_count).toBe(0);
    expect((await insertGuest({ children_count: 3 })).error).toBeNull();
    expect((await insertGuest({ children_count: -1 })).error?.code).toBe(CHECK_VIOLATION);
    expect((await insertGuest({ children_count: 101 })).error?.code).toBe(CHECK_VIOLATION);
  });

  it("bounds the comment, allergies and email", async () => {
    expect((await insertGuest({ rsvp_comment: "x".repeat(500), allergies: "x".repeat(300), email: "a@b.mk" })).error).toBeNull();
    expect((await insertGuest({ rsvp_comment: "x".repeat(501) })).error?.code).toBe(CHECK_VIOLATION);
    expect((await insertGuest({ allergies: "x".repeat(301) })).error?.code).toBe(CHECK_VIOLATION);
    expect((await insertGuest({ email: `${"x".repeat(250)}@b.mk` })).error?.code).toBe(CHECK_VIOLATION);
  });
});

describe("0060 schema: invitation sending", () => {
  it("records when and through which channel the invitation went out", async () => {
    const sentAt = "2027-01-15T10:00:00.000Z";
    for (const channel of ["whatsapp", "viber", "sms", "email", "link"]) {
      const { data, error } = await insertGuest({ invitation_sent_at: sentAt, invitation_channel: channel });
      expect(error, channel).toBeNull();
      expect(new Date(data!.invitation_sent_at).toISOString()).toBe(sentAt);
      expect(data!.invitation_channel).toBe(channel);
    }
    expect((await insertGuest({ invitation_channel: "pigeon" })).error?.code).toBe(CHECK_VIOLATION);
  });

  it("leaves a new guest marked as not yet invited", async () => {
    const { data } = await insertGuest();
    expect(data!.invitation_sent_at).toBeNull();
    expect(data!.invitation_channel).toBeNull();
  });
});
