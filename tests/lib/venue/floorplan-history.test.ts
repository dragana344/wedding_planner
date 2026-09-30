import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { venueHistoryActions } from "@/lib/venue/floorplan-history";

// S3 task 5: staff's multi-step undo/redo on the live event layout
// (events.layout_history), grouping, and seats coming back with undo.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `vhist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let venueId: string;
let roomId: string;
let tableTypeId: string;
let eventId: string;

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
  await must(admin.from("room_layout_elements").insert([
    { room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 100, y_cm: 100, width_cm: 150, length_cm: 150 },
    { room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 400, y_cm: 100, width_cm: 150, length_cm: 150 },
  ]));
  eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-10-04" }).select("id").single())).id;
  await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("staff layout history", () => {
  it("undoes and redoes moves, deletes and groupings over several steps", async () => {
    const a = venueHistoryActions;
    const [t1, t2] = await a.initializeFromStandard(eventId, roomId);
    expect(await a.getHistoryState!(eventId, roomId)).toEqual({ canUndo: false, canRedo: false });

    await a.moveElement(t1.id, 700, 700);
    const grouped = await a.group!(eventId, roomId, [t1.id, t2.id]);
    expect(new Set(grouped.map((t) => t.group_id)).size).toBe(1);
    await must(admin.from("event_seat_assignments").insert({
      event_id: eventId, room_id: roomId, layout_element_id: t2.id, seat_number: 1, guest_name: "Гостин на маса 2",
    }));
    await a.deleteElement(t2.id);
    expect(await must(admin.from("event_seat_assignments").select("id").eq("event_id", eventId))).toEqual([]);

    let layout = await a.undo(eventId, roomId); // delete undone, seat back
    expect(layout.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
    expect(await must(admin.from("event_seat_assignments").select("guest_name").eq("event_id", eventId))).toEqual([{ guest_name: "Гостин на маса 2" }]);

    layout = await a.undo(eventId, roomId); // grouping undone
    expect(layout.every((t) => !t.group_id)).toBe(true);
    layout = await a.undo(eventId, roomId); // move undone
    expect(layout.find((t) => t.id === t1.id)).toMatchObject({ x_cm: t1.x_cm, y_cm: t1.y_cm });
    expect(await a.getHistoryState!(eventId, roomId)).toEqual({ canUndo: false, canRedo: true });

    layout = await a.redo!(eventId, roomId);
    expect(layout.find((t) => t.id === t1.id)).toMatchObject({ x_cm: 700, y_cm: 700 });
  });

  it("the couple's draft history and staff history stay apart", async () => {
    const ev = await must(admin.from("events").select("seating_history, layout_history").eq("id", eventId).single());
    expect(ev.seating_history).toEqual({});
    expect(Object.keys(ev.layout_history as object)).toEqual([roomId]);
  });
});
