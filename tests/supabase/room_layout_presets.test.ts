import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  saveRoomPreset,
  listRoomPresets,
  loadRoomPreset,
  deleteRoomPreset,
  saveRoomPresetFromElements,
  getRoomPresetSnapshot,
  ReservationsBlockPresetLoadError,
} from "@/lib/venue/room-presets";
import { listFixedElements, listRoomLayoutElements } from "@/lib/venue/floorplan";

// Project A, spec §2: a room can have more than one saved, named layout.
// "Load" replaces the room's current fixed+movable elements wholesale, so
// it must refuse when a live (future, non-cancelled) reservation still
// points at one of the tables about to be deleted — reservation_tables.
// layout_element_id cascades on delete, which would silently sever that
// reservation's table link otherwise.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let roomId: string;
let tableTypeId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: `Presets Venue ${stamp}` }).select("id").single())).id;
  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Главна сала" }).select("id").single())).id;
  tableTypeId = (await must(
    admin.from("table_types").insert({ room_id: roomId, name: "Округла 8", shape: "round", seats: 8, width_cm: 160, length_cm: 160, quantity: 50 }).select("id").single(),
  )).id;
}, 60_000);
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("room layout presets (0135, Project A §2)", () => {
  it("saves the room's current fixed + movable elements as a named preset, and lists it", async () => {
    await must(admin.from("room_fixed_elements").insert({ room_id: roomId, element_type: "wall", x_cm: 0, y_cm: 0, width_cm: 1000, height_cm: 10 }));
    await must(admin.from("room_layout_elements").insert({ room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 50, y_cm: 50, width_cm: 160, length_cm: 160, label: "Маса А" }));

    const preset = await saveRoomPreset(roomId, "  Стандарден  ");
    expect(preset.name).toBe("Стандарден"); // trimmed
    expect(preset.room_id).toBe(roomId);

    const list = await listRoomPresets(roomId);
    expect(list.map((p) => p.name)).toEqual(["Стандарден"]);
  });

  it("saving the same name again updates the existing preset instead of erroring", async () => {
    await must(admin.from("room_layout_elements").insert({ room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 999, y_cm: 999, width_cm: 160, length_cm: 160 }));
    const before = await listRoomPresets(roomId);
    const second = await saveRoomPreset(roomId, "Стандарден");
    const after = await listRoomPresets(roomId);
    expect(after).toHaveLength(before.length); // still one preset named "Стандарден", not two
    expect(second.id).toBe(before[0].id);
  });

  it("loading a preset replaces the room's current elements with a fresh copy of the snapshot", async () => {
    const roomB = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба Б ${stamp}` }).select("id").single())).id;
    await must(admin.from("room_fixed_elements").insert({ room_id: roomB, element_type: "wall", x_cm: 1, y_cm: 1, width_cm: 500, height_cm: 10 }));
    const originalTable = await must(
      admin.from("room_layout_elements").insert({ room_id: roomB, element_type: "table", x_cm: 10, y_cm: 10, width_cm: 160, length_cm: 160, label: "Оригинал" }).select("id").single(),
    );
    const preset = await saveRoomPreset(roomB, "Базен распоред");

    // Rearrange the room away from the saved preset.
    await admin.from("room_layout_elements").delete().eq("room_id", roomB);
    await must(admin.from("room_layout_elements").insert({ room_id: roomB, element_type: "table", x_cm: 777, y_cm: 777, width_cm: 160, length_cm: 160, label: "Друго" }));

    await loadRoomPreset(preset.id, roomB);

    const fixed = await listFixedElements(roomB);
    const elements = await listRoomLayoutElements(roomB);
    expect(fixed).toHaveLength(1);
    expect(fixed[0]).toMatchObject({ x_cm: 1, y_cm: 1, width_cm: 500, height_cm: 10 });
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ x_cm: 10, y_cm: 10, label: "Оригинал" });
    // Fresh row identity: the id is not reused from before the load.
    expect(elements[0].id).not.toBe(originalTable.id);
  });

  it("refuses to load a preset when a live reservation still books one of the room's current tables", async () => {
    const roomC = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба Ц ${stamp}` }).select("id").single())).id;
    const preset = await saveRoomPreset(roomC, "Празна"); // empty snapshot is fine on its own
    const tableEl = await must(
      admin.from("room_layout_elements").insert({ room_id: roomC, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 160, length_cm: 160 }).select("id").single(),
    );
    const reservation = await must(
      admin.from("reservations").insert({ venue_id: venueId, room_id: roomC, guest_name: "Иван", phone: "070000000", date: "2099-01-01", start_time: "19:00", party_size: 2 }).select("id").single(),
    );
    await must(admin.from("reservation_tables").insert({ reservation_id: reservation.id, layout_element_id: tableEl.id }));

    await expect(loadRoomPreset(preset.id, roomC)).rejects.toThrow(ReservationsBlockPresetLoadError);

    // Nothing was touched: the table and its reservation link both survive.
    const stillThere = await listRoomLayoutElements(roomC);
    expect(stillThere.map((e) => e.id)).toContain(tableEl.id);
    const stillLinked = await admin.from("reservation_tables").select("layout_element_id").eq("reservation_id", reservation.id);
    expect(stillLinked.data).toHaveLength(1);
  });

  it("allows loading once the blocking reservation is cancelled", async () => {
    const roomD = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба Д ${stamp}` }).select("id").single())).id;
    const preset = await saveRoomPreset(roomD, "Нова");
    const tableEl = await must(
      admin.from("room_layout_elements").insert({ room_id: roomD, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 160, length_cm: 160 }).select("id").single(),
    );
    const reservation = await must(
      admin.from("reservations").insert({ venue_id: venueId, room_id: roomD, guest_name: "Мила", phone: "070111222", date: "2099-01-01", start_time: "19:00", party_size: 2, status: "cancelled" }).select("id").single(),
    );
    await must(admin.from("reservation_tables").insert({ reservation_id: reservation.id, layout_element_id: tableEl.id }));

    await expect(loadRoomPreset(preset.id, roomD)).resolves.toBeUndefined();
  });

  it("a past-dated reservation does not block loading", async () => {
    const roomE = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба Е ${stamp}` }).select("id").single())).id;
    const preset = await saveRoomPreset(roomE, "Стара");
    const tableEl = await must(
      admin.from("room_layout_elements").insert({ room_id: roomE, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 160, length_cm: 160 }).select("id").single(),
    );
    const reservation = await must(
      admin.from("reservations").insert({ venue_id: venueId, room_id: roomE, guest_name: "Стефан", phone: "070333444", date: "2020-01-01", start_time: "19:00", party_size: 2 }).select("id").single(),
    );
    await must(admin.from("reservation_tables").insert({ reservation_id: reservation.id, layout_element_id: tableEl.id }));

    await expect(loadRoomPreset(preset.id, roomE)).resolves.toBeUndefined();
  });

  it("refuses to load a preset belonging to a different room", async () => {
    const roomF = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба Ф ${stamp}` }).select("id").single())).id;
    const roomG = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба Г ${stamp}` }).select("id").single())).id;
    const preset = await saveRoomPreset(roomF, "Само за Ф");
    await expect(loadRoomPreset(preset.id, roomG)).rejects.toThrow();
  });

  it("deletes a preset", async () => {
    const preset = await saveRoomPreset(roomId, `За бришење ${stamp}`);
    await deleteRoomPreset(preset.id, roomId);
    const list = await listRoomPresets(roomId);
    expect(list.find((p) => p.id === preset.id)).toBeUndefined();
  });

  it("refuses an empty name", async () => {
    await expect(saveRoomPreset(roomId, "   ")).rejects.toThrow();
  });

  it("getRoomPresetSnapshot reads a preset's snapshot without touching the room's live elements", async () => {
    const roomH = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба Х ${stamp}` }).select("id").single())).id;
    await must(admin.from("room_layout_elements").insert({ room_id: roomH, element_type: "table", x_cm: 5, y_cm: 5, width_cm: 160, length_cm: 160, label: "Снапшот" }));
    const preset = await saveRoomPreset(roomH, "За читање");

    // Rearrange the room: a read must not disturb this.
    await admin.from("room_layout_elements").delete().eq("room_id", roomH);
    await must(admin.from("room_layout_elements").insert({ room_id: roomH, element_type: "table", x_cm: 900, y_cm: 900, width_cm: 160, length_cm: 160, label: "Друго" }));

    const snapshot = await getRoomPresetSnapshot(preset.id, roomH);
    expect(snapshot.elements).toMatchObject([{ x_cm: 5, y_cm: 5, label: "Снапшот" }]);

    const stillLive = await listRoomLayoutElements(roomH);
    expect(stillLive).toMatchObject([{ x_cm: 900, y_cm: 900, label: "Друго" }]);
  });

  it("getRoomPresetSnapshot refuses a preset belonging to a different room", async () => {
    const roomI = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба И ${stamp}` }).select("id").single())).id;
    const roomJ = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба Ј ${stamp}` }).select("id").single())).id;
    const preset = await saveRoomPreset(roomI, "Само за И");
    await expect(getRoomPresetSnapshot(preset.id, roomJ)).rejects.toThrow();
  });

  it("saveRoomPresetFromElements snapshots explicit elements under the room's current fixed elements", async () => {
    const roomK = (await must(admin.from("rooms").insert({ venue_id: venueId, name: `Соба К ${stamp}` }).select("id").single())).id;
    await must(admin.from("room_fixed_elements").insert({ room_id: roomK, element_type: "wall", x_cm: 2, y_cm: 2, width_cm: 300, height_cm: 10 }));
    // The room's own live movable elements must NOT leak into the snapshot — only the explicit array does.
    await must(admin.from("room_layout_elements").insert({ room_id: roomK, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 160, length_cm: 160, label: "Жива маса" }));

    const builtElements = [
      { element_type: "table" as const, table_type_id: null, x_cm: 70, y_cm: 70, width_cm: 160, length_cm: 160, rotation_deg: 0, label: "Нова маса", group_id: null, table_role: "guest" as const },
    ];
    const preset = await saveRoomPresetFromElements(roomK, "Изграден во волшебникот", builtElements);

    const snapshot = await getRoomPresetSnapshot(preset.id, roomK);
    expect(snapshot.fixed).toMatchObject([{ x_cm: 2, y_cm: 2, width_cm: 300, height_cm: 10 }]);
    expect(snapshot.elements).toEqual(builtElements);
  });
});
