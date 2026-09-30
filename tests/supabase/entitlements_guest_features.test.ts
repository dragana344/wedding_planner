import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getInviteeByToken, submitRsvpBySlug } from "@/lib/couple/rsvp";
import { findSeatByName, getSeatByToken } from "@/lib/couple/guest-page";
import { getInvitationBySlug } from "@/lib/couple/invitations";

// Session 2 features follow the package: without `personal_invite_links` a
// guest's ?g= link is just the shared invitation; without `seating` the
// guest page never reveals a table.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let planId: string;
let venueId: string;
let slug: string;
let token: string;
let guestId: string;

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `Guest features ${Date.now()}` }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "invitation", enabled: true },
    { plan_id: planId, feature_key: "max_active_events", enabled: true },
    { plan_id: planId, feature_key: "max_guests", enabled: true },
    { plan_id: planId, feature_key: "personal_invite_links", enabled: false },
    { plan_id: planId, feature_key: "seating", enabled: false },
  ]);
  venueId = (await admin.from("venues").insert({ name: "Guest Features Venue", plan_id: planId }).select("id").single()).data!.id;
  const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "G & F", event_date: "2028-06-01" }).select("id").single()).data!.id;
  slug = `gf${Date.now().toString(36)}`;
  await admin.from("event_invitations").insert({ event_id: eventId, template_id: "romantic-floral", public_slug: slug });
  const { data: guest } = await admin.from("event_guests").insert({ event_id: eventId, full_name: "Петар Петровски" }).select("id, invite_token").single();
  token = guest!.invite_token;
  guestId = guest!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("personal invite links off", () => {
  it("shows the shared invitation for a ?g= link", async () => {
    expect(await getInviteeByToken(slug, token)).toBeNull();
  });

  it("refuses an RSVP by token, leaving the guest untouched; answering by name still works", async () => {
    await expect(submitRsvpBySlug(slug, { guestToken: token, status: "confirmed", partySize: 1 })).rejects.toThrow("Поканата не е пронајдена.");
    const { data } = await admin.from("event_guests").select("rsvp_status").eq("id", guestId).single();
    expect(data!.rsvp_status).toBe("pending");
    await submitRsvpBySlug(slug, { fullName: "Петар Петровски", status: "confirmed", partySize: 1 });
    expect((await admin.from("event_guests").select("rsvp_status").eq("id", guestId).single()).data!.rsvp_status).toBe("confirmed");
  });
});

describe("seating off", () => {
  it("tells the invitation page to leave out the seat sections", async () => {
    expect((await getInvitationBySlug(slug))?.seating_enabled).toBe(false);
  });

  it("never reveals a table on the guest page", async () => {
    expect(await findSeatByName(slug, "Петар Петровски")).toEqual({ found: false, seat: null });
    expect(await getSeatByToken(slug, token)).toEqual({ found: false, seat: null });
  });
});
