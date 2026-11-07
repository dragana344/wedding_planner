import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { recordAroundRoom, undoRoomStep, redoRoomStep, roomHistoryStepState, ROOM_NOTHING_TO_UNDO, ROOM_NOTHING_TO_REDO } from "@/lib/venue/room-layout-history";
import { addRoomLayoutElement, addFixedElement, deleteRoomLayoutElement, listRoomLayoutElements, listFixedElements } from "@/lib/venue/floorplan";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const RUN = `rhist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let venueId: string;
let roomId: string;
let tableTypeId: string;

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
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("room layout history (RoomFloorPlanPage's undo/redo)", () => {
  it("undoes and redoes a table add, a fixed-element add and a delete, across both element kinds in one history", async () => {
    expect(await roomHistoryStepState(roomId, admin)).toEqual({ canUndo: false, canRedo: false });

    const table = await recordAroundRoom(
      roomId,
      () => addRoomLayoutElement({ room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 100, y_cm: 100, width_cm: 150, length_cm: 150 }),
      admin,
    );
    expect(await roomHistoryStepState(roomId, admin)).toEqual({ canUndo: true, canRedo: false });

    await recordAroundRoom(
      roomId,
      () => addFixedElement({ room_id: roomId, element_type: "wall", x_cm: 0, y_cm: 0, width_cm: 500, height_cm: 20 }),
      admin,
    );
    await recordAroundRoom(roomId, () => deleteRoomLayoutElement(table.id), admin);
    expect(await listRoomLayoutElements(roomId, admin)).toEqual([]);

    // Undo the delete: the table comes back.
    let state = await undoRoomStep(roomId, admin);
    expect(state.elements).toHaveLength(1);
    expect(state.fixed).toHaveLength(1);

    // Undo the wall add: wall gone, table still there (it predates the wall add).
    state = await undoRoomStep(roomId, admin);
    expect(state.elements).toHaveLength(1);
    expect(state.fixed).toEqual([]);

    // Undo the table add: both empty.
    state = await undoRoomStep(roomId, admin);
    expect(state.elements).toEqual([]);
    expect(state.fixed).toEqual([]);
    expect(await roomHistoryStepState(roomId, admin)).toEqual({ canUndo: false, canRedo: true });

    // Redo all three steps back.
    state = await redoRoomStep(roomId, admin);
    expect(state.elements).toHaveLength(1);
    state = await redoRoomStep(roomId, admin);
    expect(state.fixed).toHaveLength(1);
    state = await redoRoomStep(roomId, admin);
    expect(state.elements).toEqual([]); // the delete redone
    expect(await roomHistoryStepState(roomId, admin)).toEqual({ canUndo: true, canRedo: false });

    // Cleanup for the next test.
    for (const f of await listFixedElements(roomId, admin)) await admin.from("room_fixed_elements").delete().eq("id", f.id);
    await admin.from("rooms").update({ layout_history: null }).eq("id", roomId);
  });

  it("refuses to undo/redo with nothing recorded", async () => {
    await expect(undoRoomStep(roomId, admin)).rejects.toThrow(ROOM_NOTHING_TO_UNDO);
    await expect(redoRoomStep(roomId, admin)).rejects.toThrow(ROOM_NOTHING_TO_REDO);
  });

  it("keeps the undo step only when the edit itself succeeds", async () => {
    await expect(
      recordAroundRoom(
        roomId,
        async () => {
          throw new Error("boom");
        },
        admin,
      ),
    ).rejects.toThrow("boom");
    expect(await roomHistoryStepState(roomId, admin)).toEqual({ canUndo: false, canRedo: false });
  });
});
