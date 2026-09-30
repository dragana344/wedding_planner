// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listGreetingsForGuest } from "@/lib/couple/guest-greetings";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let venueId: string;
let eventId: string;
let otherEventId: string;
let guestId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: "Guest Greetings Venue" }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "G", event_date: "2028-07-01" }).select("id").single()).data!.id;
  otherEventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "H", event_date: "2028-07-02" }).select("id").single()).data!.id;
  guestId = (await admin.from("event_guests").insert({ event_id: eventId, full_name: "Петар Петровски" }).select("id").single()).data!.id;
  await admin.from("event_greetings").insert([
    { event_id: eventId, first_name: "Петар", last_name: "Петровски", message: "Честито!" },
    { event_id: eventId, first_name: "Петар", last_name: "Петровски", message: "Скриена", hidden_at: new Date().toISOString() },
    { event_id: eventId, first_name: "Ана", last_name: "Анова", message: "Од друг гостин" },
    { event_id: otherEventId, first_name: "Петар", last_name: "Петровски", message: "Од друг настан" },
  ]);
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("listGreetingsForGuest (A7)", () => {
  it("returns the visible greetings signed with the guest's name, from this event only", async () => {
    const greetings = await listGreetingsForGuest(eventId, guestId);
    expect(greetings.map((g) => g.message)).toEqual(["Честито!"]);
  });

  it("returns nothing for another event's guest", async () => {
    expect(await listGreetingsForGuest(otherEventId, guestId)).toEqual([]);
  });
});
