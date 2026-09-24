// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  addFixedElement,
  listFixedElements,
  updateFixedElementPosition,
  updateFixedElementSize,
  deleteFixedElement,
  verifyLayoutLockPassword,
  setLayoutLockPassword,
  updateRoomDimensions,
  addRoomLayoutElement,
  listRoomLayoutElements,
  updateRoomLayoutElementPosition,
  updateRoomLayoutElementSize,
  deleteRoomLayoutElement,
  listEventLayoutElements,
  addEventLayoutElement,
  updateEventLayoutElementPosition,
  updateEventLayoutElementSize,
  deleteEventLayoutElement,
  initializeEventLayoutFromStandard,
  revertEventLayoutToStandard,
  captureEventLayoutSnapshot,
  undoEventLayout,
} from "@/lib/venue/floorplan";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueId: string;
let roomId: string;
let staffEmail = "floorplan-staff@test.local";
let staffPassword = "test-password-123";
let staffUserId: string;
let staffClient: ReturnType<typeof createClient>;
let nonStaffEmail = "floorplan-nonstaff@test.local";
let nonStaffPassword = "test-password-456";
let nonStaffUserId: string;
let nonStaffClient: ReturnType<typeof createClient>;

describe("floorplan data layer: fixed elements + lock password", () => {
  beforeAll(async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Floor Plan Data Venue" }).select().single();
    venueId = venue!.id;
    const { data: room } = await admin.from("rooms").insert({ venue_id: venueId, name: "Main Hall" }).select().single();
    roomId = room!.id;

    const { data: userRes } = await admin.auth.admin.createUser({
      email: staffEmail,
      password: staffPassword,
      email_confirm: true,
    });
    staffUserId = userRes!.user!.id;
    await admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: venueId });

    staffClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await staffClient.auth.signInWithPassword({ email: staffEmail, password: staffPassword });

    const { data: nonStaffUserRes } = await admin.auth.admin.createUser({
      email: nonStaffEmail,
      password: nonStaffPassword,
      email_confirm: true,
    });
    nonStaffUserId = nonStaffUserRes!.user!.id;

    nonStaffClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await nonStaffClient.auth.signInWithPassword({ email: nonStaffEmail, password: nonStaffPassword });
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(staffUserId);
    await admin.auth.admin.deleteUser(nonStaffUserId);
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("adds, lists, moves, and deletes a fixed element", async () => {
    const created = await addFixedElement({
      room_id: roomId,
      element_type: "wall",
      x_cm: 0,
      y_cm: 0,
      width_cm: 1000,
      height_cm: 10,
    });
    expect(created.element_type).toBe("wall");

    const listed = await listFixedElements(roomId);
    expect(listed.some((e) => e.id === created.id)).toBe(true);

    const moved = await updateFixedElementPosition(created.id, 50, 60);
    expect(moved.x_cm).toBe(50);
    expect(moved.y_cm).toBe(60);

    await deleteFixedElement(created.id);
    const afterDelete = await listFixedElements(roomId);
    expect(afterDelete.some((e) => e.id === created.id)).toBe(false);
  });

  it("verifies the default lock password and rejects a wrong one", async () => {
    const correct = await verifyLayoutLockPassword(venueId, "0000", staffClient);
    expect(correct).toBe(true);

    const wrong = await verifyLayoutLockPassword(venueId, "9999", staffClient);
    expect(wrong).toBe(false);
  });

  it("changes the lock password", async () => {
    await setLayoutLockPassword(venueId, "1234", staffClient);
    const oldPasswordWorks = await verifyLayoutLockPassword(venueId, "0000", staffClient);
    expect(oldPasswordWorks).toBe(false);
    const newPasswordWorks = await verifyLayoutLockPassword(venueId, "1234", staffClient);
    expect(newPasswordWorks).toBe(true);
  });

  it("updates room dimensions", async () => {
    await updateRoomDimensions(roomId, 2500, 1800);
    const { data: room } = await admin.from("rooms").select("width_cm, height_cm").eq("id", roomId).single();
    expect(room!.width_cm).toBe(2500);
    expect(room!.height_cm).toBe(1800);
  });

  it("rejects non-staff user access to password functions", async () => {
    const canVerify = await verifyLayoutLockPassword(venueId, "1234", nonStaffClient);
    expect(canVerify).toBe(false);

    await expect(setLayoutLockPassword(venueId, "5555", nonStaffClient)).rejects.toThrow(
      "Not authorized to change this venue's layout lock password."
    );
  });

  it("resizes a fixed element", async () => {
    const created = await addFixedElement({
      room_id: roomId,
      element_type: "wall",
      x_cm: 0,
      y_cm: 0,
      width_cm: 100,
      height_cm: 20,
    });
    const resized = await updateFixedElementSize(created.id, 300, 40);
    expect(resized.width_cm).toBe(300);
    expect(resized.height_cm).toBe(40);
    await deleteFixedElement(created.id);
  });
});

describe("floorplan data layer: room standard layout elements", () => {
  let roomId: string;

  beforeAll(async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Layout Elements Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Test Room" }).select().single();
    roomId = room!.id;
  });

  afterAll(async () => {
    const { data: room } = await admin.from("rooms").select("venue_id").eq("id", roomId).single();
    await admin.from("venues").delete().eq("id", room!.venue_id);
  });

  it("adds, lists, moves, and deletes a room layout element", async () => {
    const created = await addRoomLayoutElement({
      room_id: roomId,
      element_type: "stage",
      x_cm: 200,
      y_cm: 200,
      width_cm: 300,
      length_cm: 200,
    });
    expect(created.element_type).toBe("stage");

    const listed = await listRoomLayoutElements(roomId);
    expect(listed.some((e) => e.id === created.id)).toBe(true);

    const moved = await updateRoomLayoutElementPosition(created.id, 400, 400);
    expect(moved.x_cm).toBe(400);
    expect(moved.y_cm).toBe(400);

    await deleteRoomLayoutElement(created.id);
    const afterDelete = await listRoomLayoutElements(roomId);
    expect(afterDelete.some((e) => e.id === created.id)).toBe(false);
  });

  it("resizes a room layout element", async () => {
    const created = await addRoomLayoutElement({
      room_id: roomId,
      element_type: "stage",
      x_cm: 100,
      y_cm: 100,
      width_cm: 300,
      length_cm: 200,
    });
    const resized = await updateRoomLayoutElementSize(created.id, 400, 250);
    expect(resized.width_cm).toBe(400);
    expect(resized.length_cm).toBe(250);
    await deleteRoomLayoutElement(created.id);
  });
});

describe("floorplan data layer: event layout elements", () => {
  let venueId: string;
  let roomId: string;
  let eventId: string;

  beforeAll(async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Event Layout Elements Venue" }).select().single();
    venueId = venue!.id;
    const { data: room } = await admin.from("rooms").insert({ venue_id: venueId, name: "Test Room" }).select().single();
    roomId = room!.id;

    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venueId, couple_names: "Floor Plan Couple", event_date: "2026-12-01" })
      .select()
      .single();
    eventId = event!.id;

    await admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId });
  });

  afterAll(async () => {
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("adds, lists, moves, and deletes an event layout element", async () => {
    const created = await addEventLayoutElement({
      event_id: eventId,
      room_id: roomId,
      element_type: "dance_floor",
      x_cm: 100,
      y_cm: 100,
      width_cm: 400,
      length_cm: 400,
    });
    expect(created.element_type).toBe("dance_floor");

    const listed = await listEventLayoutElements(eventId, roomId);
    expect(listed.some((e) => e.id === created.id)).toBe(true);

    const moved = await updateEventLayoutElementPosition(created.id, 150, 150);
    expect(moved.x_cm).toBe(150);

    await deleteEventLayoutElement(created.id);
    const afterDelete = await listEventLayoutElements(eventId, roomId);
    expect(afterDelete.some((e) => e.id === created.id)).toBe(false);
  });

  it("initializes an event's layout by copying the room's standard layout exactly once", async () => {
    await addRoomLayoutElement({
      room_id: roomId,
      element_type: "stage",
      x_cm: 500,
      y_cm: 500,
      width_cm: 300,
      length_cm: 200,
    });

    const firstInit = await initializeEventLayoutFromStandard(eventId, roomId);
    expect(firstInit.some((e) => e.element_type === "stage" && e.x_cm === 500)).toBe(true);

    // Move the copied element within the event's own layout.
    const stageInEvent = firstInit.find((e) => e.element_type === "stage")!;
    await updateEventLayoutElementPosition(stageInEvent.id, 999, 999);

    // Calling initialize again must NOT re-copy or duplicate — it should
    // return the event's current (already-customized) layout untouched.
    const secondInit = await initializeEventLayoutFromStandard(eventId, roomId);
    const stagesAfterSecondInit = secondInit.filter((e) => e.element_type === "stage");
    expect(stagesAfterSecondInit).toHaveLength(1);
    expect(stagesAfterSecondInit[0].x_cm).toBe(999);
  });

  it("does not duplicate the standard layout when two initialize calls race for the same event+room", async () => {
    const { data: room } = await admin.from("rooms").insert({ venue_id: venueId, name: "Race Room" }).select().single();
    const raceRoomId = room!.id;
    await admin.from("event_rooms").insert({ event_id: eventId, room_id: raceRoomId });
    await addRoomLayoutElement({
      room_id: raceRoomId,
      element_type: "stage",
      x_cm: 500,
      y_cm: 500,
      width_cm: 300,
      length_cm: 200,
    });

    // Simulates two overlapping requests for the same event+room (e.g. the
    // couple's seating page being hit twice) both seeing "not yet
    // initialized" — the atomic claim on event_rooms must let only one of
    // them actually copy the standard layout in.
    const [first, second] = await Promise.all([
      initializeEventLayoutFromStandard(eventId, raceRoomId),
      initializeEventLayoutFromStandard(eventId, raceRoomId),
    ]);
    expect(first.length + second.length).toBeGreaterThan(0);

    const finalElements = await listEventLayoutElements(eventId, raceRoomId);
    expect(finalElements.filter((e) => e.element_type === "stage")).toHaveLength(1);
  });

  it("reverts an event's layout back to the room's current standard layout", async () => {
    const reverted = await revertEventLayoutToStandard(eventId, roomId);
    const stage = reverted.find((e) => e.element_type === "stage");
    expect(stage?.x_cm).toBe(500);
  });

  it("keeps each room's event layout independent when an event spans multiple rooms", async () => {
    const { data: roomB } = await admin
      .from("rooms")
      .insert({ venue_id: venueId, name: "Second Room" })
      .select()
      .single();
    const roomBId = roomB!.id;
    await admin.from("event_rooms").insert({ event_id: eventId, room_id: roomBId });

    await addRoomLayoutElement({
      room_id: roomBId,
      element_type: "dance_floor",
      x_cm: 700,
      y_cm: 700,
      width_cm: 400,
      length_cm: 400,
    });

    const roomAInit = await initializeEventLayoutFromStandard(eventId, roomId);
    expect(roomAInit.every((el) => el.room_id === roomId)).toBe(true);

    const roomBInit = await initializeEventLayoutFromStandard(eventId, roomBId);
    expect(roomBInit.every((el) => el.room_id === roomBId)).toBe(true);
    expect(roomBInit.some((el) => el.element_type === "dance_floor")).toBe(true);

    // Reverting room B must not touch room A's elements.
    await revertEventLayoutToStandard(eventId, roomBId);
    const roomAStillThere = await listEventLayoutElements(eventId, roomId);
    expect(roomAStillThere.length).toBeGreaterThan(0);
  });

  it("resizes an event layout element", async () => {
    const created = await addEventLayoutElement({
      event_id: eventId,
      room_id: roomId,
      element_type: "dance_floor",
      x_cm: 100,
      y_cm: 100,
      width_cm: 400,
      length_cm: 400,
    });
    const resized = await updateEventLayoutElementSize(created.id, 500, 350);
    expect(resized.width_cm).toBe(500);
    expect(resized.length_cm).toBe(350);
    await deleteEventLayoutElement(created.id);
  });
});

describe("floorplan data layer: undo snapshot", () => {
  let venueId: string;
  let roomId2: string;
  let eventId: string;

  beforeAll(async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Undo Snapshot Venue" }).select().single();
    venueId = venue!.id;

    const { data: room } = await admin
      .from("rooms")
      .insert({ venue_id: venueId, name: "Undo Test Room" })
      .select()
      .single();
    roomId2 = room!.id;

    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venueId, couple_names: "Undo Couple", event_date: "2026-12-05" })
      .select()
      .single();
    eventId = event!.id;

    await addEventLayoutElement({
      event_id: eventId,
      room_id: roomId2,
      element_type: "table",
      x_cm: 100,
      y_cm: 100,
      width_cm: 150,
      length_cm: 150,
    });
  });

  afterAll(async () => {
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("captures a snapshot, allows edits, then restores exactly to the snapshot", async () => {
    await captureEventLayoutSnapshot(eventId, roomId2);

    const before = await listEventLayoutElements(eventId, roomId2);
    const table = before[0];
    await updateEventLayoutElementPosition(table.id, 900, 900);
    await addEventLayoutElement({
      event_id: eventId,
      room_id: roomId2,
      element_type: "table",
      x_cm: 300,
      y_cm: 300,
      width_cm: 150,
      length_cm: 150,
    });

    const midway = await listEventLayoutElements(eventId, roomId2);
    expect(midway).toHaveLength(2);

    const restored = await undoEventLayout(eventId, roomId2);
    expect(restored).toHaveLength(1);
    expect(restored[0].x_cm).toBe(100);
    expect(restored[0].y_cm).toBe(100);
    expect(restored[0].element_type).toBe("table");
    expect(restored[0].width_cm).toBe(150);
    expect(restored[0].length_cm).toBe(150);
    expect(restored[0].rotation_deg).toBe(0);
    expect(restored[0].label).toBeNull();
    expect(restored[0].table_type_id).toBeNull();

    // Undo is single-level: calling it again with no new snapshot captured
    // should throw, since there's nothing left to restore.
    await expect(undoEventLayout(eventId, roomId2)).rejects.toThrow();
  });
});

describe("floorplan data layer: event layout functions accept an injectable client", () => {
  it("initializes, snapshots, and undoes using an explicitly passed client", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Injectable Client Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Room" }).select().single();
    await admin.from("room_layout_elements").insert({
      room_id: room!.id,
      element_type: "stage",
      x_cm: 10,
      y_cm: 10,
      width_cm: 100,
      length_cm: 100,
    });
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Injectable & Test", event_date: "2026-12-15" })
      .select()
      .single();
    await admin.from("event_rooms").insert({ event_id: event!.id, room_id: room!.id });

    const initial = await initializeEventLayoutFromStandard(event!.id, room!.id, admin);
    expect(initial).toHaveLength(1);
    await captureEventLayoutSnapshot(event!.id, room!.id, admin);
    await deleteEventLayoutElement(initial[0].id, admin);
    const restored = await undoEventLayout(event!.id, room!.id, admin);
    expect(restored).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
