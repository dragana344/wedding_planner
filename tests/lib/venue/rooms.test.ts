// @vitest-environment node
//
// This suite exercises lib/venue/rooms.ts, which resolves a service-role
// Supabase client when `window` is undefined (see lib/supabase/resolve-client.ts).
// The project's default Vitest environment is jsdom (for component tests),
// which defines a global `window` and would otherwise force this suite onto
// the anon/browser client, failing on RLS. Overriding to the "node"
// environment for this file restores the intended Node-test-time behavior.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  listRooms,
  createRoom,
  listTableTypes,
  upsertTableType,
  updateTableType,
  deleteTableType,
  getRoomById,
  updateRoomName,
  deleteRoom,
} from "@/lib/venue/rooms";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueId: string;

describe("rooms data layer", () => {
  beforeAll(async () => {
    const { data } = await admin.from("venues").insert({ name: "Rooms Test Venue" }).select().single();
    venueId = data!.id;
  });

  afterAll(async () => {
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("creates and lists rooms for a venue", async () => {
    await createRoom(venueId, "Garden");
    const rooms = await listRooms(venueId);
    expect(rooms.some((r) => r.name === "Garden")).toBe(true);
  });

  it("upserts a table type and lists it by room", async () => {
    const room = await createRoom(venueId, "Indoor Hall");
    await upsertTableType({
      room_id: room.id,
      name: "Round-10",
      shape: "round",
      seats: 10,
      width_cm: 150,
      length_cm: 150,
      quantity: 12,
    });
    const tableTypes = await listTableTypes(room.id);
    expect(tableTypes).toHaveLength(1);
    expect(tableTypes[0].quantity).toBe(12);
  });

  it("fetches a single room by id", async () => {
    const room = await createRoom(venueId, "Rooftop");
    const found = await getRoomById(room.id);
    expect(found?.id).toBe(room.id);
    expect(found?.venue_id).toBe(venueId);

    const missing = await getRoomById("00000000-0000-0000-0000-000000000000");
    expect(missing).toBeNull();
  });

  it("renames a room", async () => {
    const room = await createRoom(venueId, "Old Name");
    const renamed = await updateRoomName(room.id, "New Name");
    expect(renamed.name).toBe("New Name");

    const found = await getRoomById(room.id);
    expect(found?.name).toBe("New Name");
  });

  it("updates and deletes a table type", async () => {
    const room = await createRoom(venueId, "Ballroom");
    const created = await upsertTableType({
      room_id: room.id,
      name: "Round-8",
      shape: "round",
      seats: 8,
      width_cm: 150,
      length_cm: 150,
      quantity: 5,
    });

    const updated = await updateTableType(created.id, {
      room_id: room.id,
      name: "Round-8 Updated",
      shape: "round",
      seats: 8,
      width_cm: 150,
      length_cm: 150,
      quantity: 10,
    });
    expect(updated.name).toBe("Round-8 Updated");
    expect(updated.quantity).toBe(10);

    await deleteTableType(created.id);
    const remaining = await listTableTypes(room.id);
    expect(remaining.some((t) => t.id === created.id)).toBe(false);
  });

  it("deletes a room", async () => {
    const room = await createRoom(venueId, "Temporary Room");
    await deleteRoom(room.id);
    const found = await getRoomById(room.id);
    expect(found).toBeNull();
  });
});
