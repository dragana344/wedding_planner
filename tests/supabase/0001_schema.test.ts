import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("0001 schema: venues, rooms, table_types", () => {
  it("can insert a venue, room, and table type and read them back", async () => {
    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .insert({ name: "Test Venue" })
      .select()
      .single();
    expect(venueError).toBeNull();

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .insert({ venue_id: venue!.id, name: "Indoor Hall" })
      .select()
      .single();
    expect(roomError).toBeNull();

    const { data: tableType, error: tableTypeError } = await supabase
      .from("table_types")
      .insert({
        room_id: room!.id,
        name: "Round-10",
        shape: "round",
        seats: 10,
        width_cm: 150,
        length_cm: 150,
        quantity: 12,
      })
      .select()
      .single();
    expect(tableTypeError).toBeNull();
    expect(tableType!.quantity).toBe(12);

    await supabase.from("venues").delete().eq("id", venue!.id);
  });
});
