import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { venueHistoryActions } from "@/lib/venue/floorplan-history";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

// Final-review fixes (S3): staff undo never deletes the couple's seats (C1)
// and restores atomically (I1); table types shrinking or going away free
// seats (I3); confirming clears the draft so the live layout rules (I4).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `s3fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let venueId: string;
let roomId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

async function tableType(seats: number): Promise<string> {
  return (await must(
    admin.from("table_types").insert({ room_id: roomId, name: `T${seats}-${randomUUID().slice(0, 4)}`, shape: "round", seats, width_cm: 150, length_cm: 150, quantity: 20 }).select("id").single(),
  )).id;
}

async function newEvent(): Promise<string> {
  const id = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-12-01" }).select("id").single())).id;
  await must(admin.from("event_rooms").insert({ event_id: id, room_id: roomId, layout_initialized_at: new Date().toISOString() }));
  return id;
}

async function liveTable(eventId: string, typeId: string): Promise<string> {
  return (await must(
    admin.from("event_layout_elements")
      .insert({ event_id: eventId, room_id: roomId, element_type: "table", table_type_id: typeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select("id").single(),
  )).id;
}

async function seatsOf(eventId: string) {
  return must(admin.from("event_seat_assignments").select("layout_element_id, seat_number, guest_name").eq("event_id", eventId).order("seat_number"));
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: RUN }).select("id").single())).id;
  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала" }).select("id").single())).id;
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("C1: staff undo keeps seats made in between", () => {
  it("undoing a staff move does not delete the couple's later seating", async () => {
    const eventId = await newEvent();
    const table = await liveTable(eventId, await tableType(10));
    await venueHistoryActions.moveElement(table, 500, 500); // snapshot: no seats
    await must(admin.from("event_seat_assignments").insert([
      { event_id: eventId, room_id: roomId, layout_element_id: table, seat_number: 1, guest_name: "Прв" },
      { event_id: eventId, room_id: roomId, layout_element_id: table, seat_number: 2, guest_name: "Втор" },
    ]));
    await venueHistoryActions.undo(eventId, roomId);
    expect((await seatsOf(eventId)).map((s) => s.guest_name)).toEqual(["Прв", "Втор"]);
  });

  it("undoing a staff delete brings the table and its seats back", async () => {
    const eventId = await newEvent();
    const table = await liveTable(eventId, await tableType(10));
    await must(admin.from("event_seat_assignments").insert({ event_id: eventId, room_id: roomId, layout_element_id: table, seat_number: 3, guest_name: "Кум" }));
    await venueHistoryActions.deleteElement(table);
    expect(await seatsOf(eventId)).toEqual([]);
    await venueHistoryActions.undo(eventId, roomId);
    expect((await seatsOf(eventId)).map((s) => s.guest_name)).toEqual(["Кум"]);
  });
});

describe("I1: staff restore is one transaction", () => {
  it("a snapshot whose table type was deleted restores the tables without it instead of emptying the room", async () => {
    const eventId = await newEvent();
    const doomed = await tableType(8);
    const keep = await tableType(10);
    const a = await liveTable(eventId, doomed);
    const b = await liveTable(eventId, keep);
    await venueHistoryActions.moveElement(b, 300, 300);
    await must(admin.from("table_types").delete().eq("id", doomed));
    const layout = await venueHistoryActions.undo(eventId, roomId);
    expect(layout.map((e) => e.id).sort()).toEqual([a, b].sort());
    expect(layout.find((e) => e.id === a)!.table_type_id).toBeNull();
  });
});

describe("I3: table types shrinking or going away", () => {
  it("frees seats beyond a smaller capacity, and tells staff how many first", async () => {
    const eventId = await newEvent();
    const type = await tableType(12);
    const table = await liveTable(eventId, type);
    await must(admin.from("event_seat_assignments").insert(
      [1, 11, 12].map((n) => ({ event_id: eventId, room_id: roomId, layout_element_id: table, seat_number: n, guest_name: `Г${n}` })),
    ));
    expect(await must(admin.rpc("seats_affected_by_table_type", { p_table_type_id: type, p_seats: 10 }))).toBe(2);
    await must(admin.from("table_types").update({ seats: 10 }).eq("id", type));
    expect((await seatsOf(eventId)).map((s) => s.seat_number)).toEqual([1]);
  });

  it("frees the seats of a deleted type, and the couple can still confirm a draft that used it", async () => {
    const eventId = await newEvent();
    const type = await tableType(10);
    const tableId = randomUUID();
    await must(admin.from("events").update({
      seating_draft: { [roomId]: [{ id: tableId, event_id: eventId, room_id: roomId, element_type: "table", table_type_id: type, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null }] },
    }).eq("id", eventId));
    await must(admin.from("event_seat_assignments").insert({ event_id: eventId, room_id: roomId, layout_element_id: tableId, seat_number: 1, guest_name: "Г" }));
    expect(await must(admin.rpc("seats_affected_by_table_type", { p_table_type_id: type, p_seats: null }))).toBe(1);
    await must(admin.from("table_types").delete().eq("id", type));
    expect(await seatsOf(eventId)).toEqual([]);
    await coupleSeatingActionsFor(eventId).confirm!(eventId, roomId);
    const live = await must(admin.from("event_layout_elements").select("id, table_type_id").eq("event_id", eventId));
    expect(live).toEqual([{ id: tableId, table_type_id: null }]);
  });
});

describe("I4: confirming hands the room back to the live layout", () => {
  it("clears the room's draft, so staff's later tables are numbered and seatable", async () => {
    const eventId = await newEvent();
    const type = await tableType(10);
    const actions = coupleSeatingActionsFor(eventId);
    await actions.addElement({ event_id: eventId, room_id: roomId, element_type: "table", table_type_id: type, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 });
    await actions.confirm!(eventId, roomId);
    const ev = await must(admin.from("events").select("seating_draft").eq("id", eventId).single());
    expect(ev.seating_draft).not.toHaveProperty(roomId);
    const staffTable = await liveTable(eventId, type);
    const tables = await must(admin.rpc("event_room_tables", { p_event_id: eventId, p_room_id: roomId }));
    expect((tables as { element_id: string }[]).map((t) => t.element_id)).toContain(staffTable);
  });
});
