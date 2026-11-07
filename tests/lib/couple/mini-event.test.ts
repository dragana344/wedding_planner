// tests/lib/couple/mini-event.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getMiniEventTables } from "@/lib/couple/mini-event";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

describe("lib/couple/mini-event: getMiniEventTables (Project B §3)", () => {
  it("returns null for a full event (no linked reservation)", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Mini Tables Lib Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Full Event", event_date: "2026-12-06" })
      .select()
      .single();

    expect(await getMiniEventTables(event!.id)).toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("labels the mini-event's assigned tables by their room number, sorted, and says so when none are assigned yet", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Mini Tables Lib Venue 2" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Градина" }).select().single();
    const { data: tableType } = await admin
      .from("table_types")
      .insert({ room_id: room!.id, name: "Round-4", shape: "round", seats: 4, width_cm: 100, length_cm: 100, quantity: 10 })
      .select()
      .single();
    // Inserted one at a time (not Promise.all) so created_at — what
    // numberTables orders by — matches insertion order.
    const tableIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { data } = await admin
        .from("room_layout_elements")
        .insert({ room_id: room!.id, element_type: "table", table_type_id: tableType!.id, x_cm: i * 200, y_cm: 0, width_cm: 100, length_cm: 100 })
        .select("id")
        .single();
      tableIds.push(data!.id);
    }
    const [t1, , t3] = tableIds;

    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Mini Birthday", event_date: "2026-12-07", seating_mode: "mini" })
      .select()
      .single();
    const { data: reservation } = await admin
      .from("reservations")
      .insert({ venue_id: venue!.id, room_id: room!.id, event_id: event!.id, guest_name: "Mini Birthday", phone: "070 1", date: "2026-12-07", start_time: "18:00", party_size: 8 })
      .select("id")
      .single();

    expect(await getMiniEventTables(event!.id)).toEqual({ roomName: "Градина", tableLabels: [] });

    // Assigned out of number order (table 3, then table 1) — the labels still come back sorted.
    await admin.from("reservation_tables").insert([
      { reservation_id: reservation!.id, layout_element_id: t3 },
      { reservation_id: reservation!.id, layout_element_id: t1 },
    ]);

    expect(await getMiniEventTables(event!.id)).toEqual({ roomName: "Градина", tableLabels: ["Маса 1", "Маса 3"] });

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
