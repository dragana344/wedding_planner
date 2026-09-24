import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("0003 schema: events, event_rooms", () => {
  it("can create an event spanning two rooms", async () => {
    const { data: venue } = await supabase
      .from("venues")
      .insert({ name: "Events Test Venue" })
      .select()
      .single();
    const { data: room1 } = await supabase
      .from("rooms")
      .insert({ venue_id: venue!.id, name: "Garden" })
      .select()
      .single();
    const { data: room2 } = await supabase
      .from("rooms")
      .insert({ venue_id: venue!.id, name: "Indoor Hall" })
      .select()
      .single();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        venue_id: venue!.id,
        couple_names: "Ana & Marko",
        event_date: "2026-09-12",
      })
      .select()
      .single();
    expect(eventError).toBeNull();

    const { error: linkError } = await supabase.from("event_rooms").insert([
      { event_id: event!.id, room_id: room1!.id },
      { event_id: event!.id, room_id: room2!.id },
    ]);
    expect(linkError).toBeNull();

    const { data: rooms } = await supabase
      .from("event_rooms")
      .select("room_id")
      .eq("event_id", event!.id);
    expect(rooms).toHaveLength(2);

    await supabase.from("venues").delete().eq("id", venue!.id);
  });
});
