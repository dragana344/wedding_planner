// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { upsertInvitation } from "@/lib/couple/invitations";
import { findSeatByName, getSeatByToken } from "@/lib/couple/guest-page";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let venueId: string;
let slug: string;
let otherSlug: string;
let tokens: Record<string, string>;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Guest Page Venue" }).select("id").single();
  venueId = venue!.id;
  const mk = async (names: string) => {
    const { data } = await admin.from("events").insert({ venue_id: venueId, couple_names: names, event_date: "2027-06-20" }).select("id").single();
    return data!.id as string;
  };
  const eventId = await mk("Страна А");
  const otherId = await mk("Страна Б");
  slug = (await upsertInvitation(eventId, { template_id: "elegant-gold", message: null })).public_slug;
  otherSlug = (await upsertInvitation(otherId, { template_id: "elegant-gold", message: null })).public_slug;
  const { data: guests } = await admin
    .from("event_guests")
    .insert([
      { event_id: eventId, full_name: "Петар Петровски" },
      { event_id: eventId, full_name: "Ана Ана" },
      { event_id: eventId, full_name: "Ана Ана" },
      { event_id: otherId, full_name: "Друг Гостин" },
    ])
    .select("full_name, invite_token");
  tokens = Object.fromEntries(guests!.map((g) => [g.full_name, g.invite_token]));
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("guest page seat lookups (A15, A16)", () => {
  it("answers for the personal link's guest: not seated yet", async () => {
    expect(await getSeatByToken(slug, tokens["Петар Петровски"])).toEqual({ found: true, seat: null });
  });

  it("refuses a token from another event or a malformed one", async () => {
    expect(await getSeatByToken(slug, tokens["Друг Гостин"])).toEqual({ found: false, seat: null });
    expect(await getSeatByToken(slug, "bad")).toEqual({ found: false, seat: null });
    expect(await getSeatByToken("no-such-slug", tokens["Петар Петровски"])).toEqual({ found: false, seat: null });
  });

  it("finds a seat by a unique name only, ignoring case and spaces", async () => {
    expect(await findSeatByName(slug, "  петар петровски ")).toEqual({ found: true, seat: null });
    expect(await findSeatByName(slug, "Ана Ана")).toEqual({ found: false, seat: null }); // two guests share it
    expect(await findSeatByName(slug, "Непознат")).toEqual({ found: false, seat: null });
    expect(await findSeatByName(otherSlug, "Петар Петровски")).toEqual({ found: false, seat: null });
    expect(await findSeatByName(slug, "  ")).toEqual({ found: false, seat: null });
  });
});
