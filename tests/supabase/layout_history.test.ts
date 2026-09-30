import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

// S3 task 5 (migration 0072): table groups, per-room undo/redo history and
// restoring a room's seats from a snapshot.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const RUN = `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let venueId: string;
let roomId: string;
let tableTypeId: string;
let eventId: string;
let tableId: string;
let guestId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: RUN }).select("id").single())).id;
  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала" }).select("id").single())).id;
  tableTypeId = (await must(
    admin.from("table_types").insert({ room_id: roomId, name: "R4", shape: "round", seats: 4, width_cm: 150, length_cm: 150, quantity: 9 }).select("id").single(),
  )).id;
  eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-10-01" }).select("id").single())).id;
  await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
  tableId = (await must(
    admin.from("event_layout_elements")
      .insert({ event_id: eventId, room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select("id").single(),
  )).id;
  guestId = (await must(admin.from("event_guests").insert({ event_id: eventId, full_name: "Ана" }).select("id").single())).id;
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("layout groups and history (0072)", () => {
  it("adds group_id to layout elements and empty histories to events", async () => {
    const group = randomUUID();
    await must(admin.from("event_layout_elements").update({ group_id: group }).eq("id", tableId));
    const el = await must(admin.from("event_layout_elements").select("group_id").eq("id", tableId).single());
    expect(el.group_id).toBe(group);
    const ev = await must(admin.from("events").select("seating_history, layout_history").eq("id", eventId).single());
    expect(ev).toEqual({ seating_history: {}, layout_history: {} });
    const room = await must(
      admin.from("room_layout_elements")
        .insert({ room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150, group_id: group })
        .select("group_id").single(),
    );
    expect(room.group_id).toBe(group);
  });

  it("confirm_event_seating keeps each table's group", async () => {
    const group = randomUUID();
    await must(admin.rpc("confirm_event_seating", {
      p_event_id: eventId,
      p_room_id: roomId,
      p_elements: [{
        id: tableId, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0,
        width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, group_id: group,
      }],
      p_confirmed_at: new Date().toISOString(),
    }));
    const el = await must(admin.from("event_layout_elements").select("id, group_id").eq("event_id", eventId).single());
    expect(el).toEqual({ id: tableId, group_id: group });
  });

  it("restore_room_seats puts back seats whose guest and table still exist", async () => {
    await must(admin.from("event_seat_assignments").insert({
      event_id: eventId, room_id: roomId, layout_element_id: tableId, seat_number: 4, guest_name: "Се брише при враќање",
    }));
    const restored = await must(admin.rpc("restore_room_seats", {
      p_event_id: eventId,
      p_room_id: roomId,
      p_seats: [
        { layout_element_id: tableId, seat_number: 1, guest_id: guestId, guest_name: null },
        { layout_element_id: tableId, seat_number: 2, guest_id: randomUUID(), guest_name: null }, // guest deleted since
        { layout_element_id: randomUUID(), seat_number: 1, guest_id: null, guest_name: "Маса ја нема" },
        { layout_element_id: tableId, seat_number: 3, guest_id: null, guest_name: "Баба" },
      ],
    }));
    expect(restored).toBe(2);
    const rows = await must(
      admin.from("event_seat_assignments").select("seat_number, guest_id, guest_name").eq("event_id", eventId).order("seat_number"),
    );
    expect(rows).toEqual([
      { seat_number: 1, guest_id: guestId, guest_name: null },
      { seat_number: 3, guest_id: null, guest_name: "Баба" },
    ]);
  });

  it("restore_room_seats is server-only", async () => {
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error } = await anon.rpc("restore_room_seats", { p_event_id: eventId, p_room_id: roomId, p_seats: [] });
    expect(error?.code).toBe("42501");
  });

  it("erasure empties both histories", async () => {
    await must(admin.from("events").update({
      seating_history: { [roomId]: { past: [{ elements: [], seats: [{ guest_name: "Лично" }] }], future: [] } },
      layout_history: { [roomId]: { past: [], future: [{ elements: [{ label: "Лично" }], seats: [] }] } },
    }).eq("id", eventId));
    await must(admin.rpc("erase_event_personal_data", { p_event_id: eventId }));
    const ev = await must(admin.from("events").select("seating_history, layout_history").eq("id", eventId).single());
    expect(ev).toEqual({ seating_history: {}, layout_history: {} });
  });
});
