import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { initializeEventLayoutFromStandard } from "@/lib/venue/floorplan";

// "Маса N" follows the order tables were placed. Rows written in one statement
// (confirm, copying the standard layout) used to share one created_at, so the
// confirmed layout's numbers came out in random (id) order.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let venueId: string;
let roomId: string;
let tableTypeId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

async function newEvent(): Promise<string> {
  const id = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-11-01" }).select("id").single())).id;
  await must(admin.from("event_rooms").insert({ event_id: id, room_id: roomId }));
  return id;
}

async function numbering(eventId: string): Promise<string[]> {
  const rows = await must(admin.rpc("event_room_tables", { p_event_id: eventId, p_room_id: roomId }));
  return (rows as { element_id: string; ord: number }[]).sort((a, b) => a.ord - b.ord).map((r) => r.element_id);
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: RUN }).select("id").single())).id;
  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала" }).select("id").single())).id;
  tableTypeId = (await must(
    admin.from("table_types").insert({ room_id: roomId, name: "R", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 30 }).select("id").single(),
  )).id;
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("table order survives bulk writes", () => {
  it("confirm keeps the draft's order", async () => {
    const eventId = await newEvent();
    const ids = Array.from({ length: 12 }, () => randomUUID());
    await must(admin.rpc("confirm_event_seating", {
      p_event_id: eventId,
      p_room_id: roomId,
      p_elements: ids.map((id, i) => ({
        id, element_type: "table", table_type_id: tableTypeId, x_cm: i * 10, y_cm: 0, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null,
      })),
      p_confirmed_at: new Date().toISOString(),
    }));
    expect(await numbering(eventId)).toEqual(ids);
  });

  it("copying the standard layout keeps the room's order", async () => {
    for (let i = 0; i < 12; i++) {
      await must(admin.from("room_layout_elements").insert({
        room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: i * 10, y_cm: 0, width_cm: 150, length_cm: 150, label: `S${i}`,
      }));
    }
    const eventId = await newEvent();
    await initializeEventLayoutFromStandard(eventId, roomId);
    const byId = new Map((await must(admin.from("event_layout_elements").select("id, label").eq("event_id", eventId))).map((r) => [r.id, r.label]));
    expect((await numbering(eventId)).map((id) => byId.get(id))).toEqual(Array.from({ length: 12 }, (_, i) => `S${i}`));
  });
});
