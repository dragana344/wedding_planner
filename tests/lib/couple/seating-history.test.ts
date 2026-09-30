import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";
import { replaceTableSeats } from "@/lib/seating/seats";

// S3 task 5: the couple's multi-step undo/redo, grouping, and the client's
// scenario "group → seat → move → revert to standard → undo back to before
// the grouping".

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `chist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let venueId: string;
let roomId: string;
let tableTypeId: string;
let eventId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

async function seats() {
  return must(admin.from("event_seat_assignments").select("layout_element_id, seat_number, guest_name").eq("event_id", eventId).order("seat_number"));
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: RUN }).select("id").single())).id;
  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала" }).select("id").single())).id;
  tableTypeId = (await must(
    admin.from("table_types").insert({ room_id: roomId, name: "R4", shape: "round", seats: 4, width_cm: 150, length_cm: 150, quantity: 9 }).select("id").single(),
  )).id;
  // Standard layout: two tables.
  await must(admin.from("room_layout_elements").insert([
    { room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 100, y_cm: 100, width_cm: 150, length_cm: 150 },
    { room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 400, y_cm: 100, width_cm: 150, length_cm: 150 },
  ]));
  eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-10-02" }).select("id").single())).id;
  await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("couple seating history", () => {
  it("groups, undoes and redoes the grouping", async () => {
    const actions = coupleSeatingActionsFor(eventId);
    const tables = await actions.initializeFromStandard(eventId, roomId);
    expect(await actions.getHistoryState!(eventId, roomId)).toEqual({ canUndo: false, canRedo: false });

    const grouped = await actions.group!(eventId, roomId, tables.map((t) => t.id));
    const groupId = grouped[0].group_id;
    expect(groupId).toBeTruthy();
    expect(grouped.every((t) => t.group_id === groupId)).toBe(true);
    expect(await actions.getHistoryState!(eventId, roomId)).toEqual({ canUndo: true, canRedo: false });

    const undone = await actions.undo(eventId, roomId);
    expect(undone.every((t) => !t.group_id)).toBe(true);
    expect(await actions.getHistoryState!(eventId, roomId)).toEqual({ canUndo: false, canRedo: true });

    const redone = await actions.redo!(eventId, roomId);
    expect(redone.every((t) => t.group_id === groupId)).toBe(true);

    const ungrouped = await actions.ungroup!(eventId, roomId, groupId!);
    expect(ungrouped.every((t) => !t.group_id)).toBe(true);
    await actions.undo(eventId, roomId); // back to grouped
  });

  it("walks the client's scenario back step by step, seats included", async () => {
    const actions = coupleSeatingActionsFor(eventId);
    const before = await actions.listLayoutElements(eventId, roomId); // grouped
    const [first] = before;

    await replaceTableSeats(eventId, roomId, first.id, [{ seatNumber: 1, guestName: "Кум" }], { recordHistory: true });
    await actions.moveElement(first.id, 900, 900);
    const added = await actions.addElement({
      event_id: eventId, room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 50, y_cm: 600, width_cm: 150, length_cm: 150,
    });
    await replaceTableSeats(eventId, roomId, added.id, [{ seatNumber: 2, guestName: "На новата маса" }], { recordHistory: true });
    await actions.revertToStandard(eventId, roomId);
    expect(await seats()).toEqual([]); // standard layout: fresh ids, every seat freed

    // 1: before "стандардно" — the extra table and both seats are back.
    let layout = await actions.undo(eventId, roomId);
    expect(layout.map((t) => t.id)).toContain(added.id);
    expect((await seats()).map((s) => s.guest_name)).toEqual(["Кум", "На новата маса"]);

    // 2: before the second seat. 3: before the extra table. 4: before the move.
    await actions.undo(eventId, roomId);
    expect((await seats()).map((s) => s.guest_name)).toEqual(["Кум"]);
    layout = await actions.undo(eventId, roomId);
    expect(layout.map((t) => t.id)).not.toContain(added.id);
    layout = await actions.undo(eventId, roomId);
    expect(layout.find((t) => t.id === first.id)).toMatchObject({ x_cm: first.x_cm, y_cm: first.y_cm });

    // 5: before the first seat — still grouped, nobody seated.
    layout = await actions.undo(eventId, roomId);
    expect(await seats()).toEqual([]);
    expect(new Set(layout.map((t) => t.group_id)).size).toBe(1);

    // 6: before the grouping (made in the previous test).
    layout = await actions.undo(eventId, roomId);
    expect(layout.every((t) => !t.group_id)).toBe(true);
  });

  it("never touches the confirmed layout staff see", async () => {
    const actions = coupleSeatingActionsFor(eventId);
    await actions.confirm!(eventId, roomId);
    const extra = await must(
      admin.from("event_layout_elements")
        .insert({ event_id: eventId, room_id: roomId, element_type: "stage", x_cm: 0, y_cm: 0, width_cm: 300, length_cm: 200 })
        .select("id").single(),
    );
    await actions.moveElement((await actions.listLayoutElements(eventId, roomId))[0].id, 10, 10);
    await actions.undo(eventId, roomId);
    const live = await must(admin.from("event_layout_elements").select("id").eq("id", extra.id));
    expect(live).toHaveLength(1);
  });

  it("says so when there is nothing to undo or redo", async () => {
    const other = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: `${RUN} 2`, event_date: "2027-10-03" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: other, room_id: roomId }));
    const actions = coupleSeatingActionsFor(other);
    await actions.initializeFromStandard(other, roomId);
    await expect(actions.undo(other, roomId)).rejects.toThrow("Нема што да се врати.");
    await expect(actions.redo!(other, roomId)).rejects.toThrow("Нема што да се повтори.");
  });
});
