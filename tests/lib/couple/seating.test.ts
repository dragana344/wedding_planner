// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/seating: coupleSeatingActionsFor", () => {
  it("scopes addElement to the given event, rejecting a room not assigned to it", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Couple Seating Lib Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Room" }).select().single();
    const { data: otherRoom } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Other Room" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Couple & Seating", event_date: "2026-12-20" })
      .select()
      .single();
    await admin.from("event_rooms").insert({ event_id: event!.id, room_id: room!.id });

    const actions = coupleSeatingActionsFor(event!.id);

    const created = await actions.addElement({
      event_id: event!.id,
      room_id: room!.id,
      element_type: "stage",
      x_cm: 0,
      y_cm: 0,
      width_cm: 100,
      length_cm: 100,
    });
    expect(created.room_id).toBe(room!.id);

    await expect(
      actions.addElement({
        event_id: event!.id,
        room_id: otherRoom!.id,
        element_type: "stage",
        x_cm: 0,
        y_cm: 0,
        width_cm: 100,
        length_cm: 100,
      })
    ).rejects.toThrow("Room is not assigned to this event.");

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("rejects moving an element that belongs to a different event's draft", async () => {
    const { data: venueA } = await admin.from("venues").insert({ name: "Seating Owner A" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venueA!.id, name: "Room" }).select().single();
    const { data: eventA } = await admin
      .from("events")
      .insert({ venue_id: venueA!.id, couple_names: "A", event_date: "2026-12-21" })
      .select()
      .single();
    const { data: eventB } = await admin
      .from("events")
      .insert({ venue_id: venueA!.id, couple_names: "B", event_date: "2026-12-22" })
      .select()
      .single();
    await admin.from("event_rooms").insert([
      { event_id: eventA!.id, room_id: room!.id },
      { event_id: eventB!.id, room_id: room!.id },
    ]);

    const actionsForA = coupleSeatingActionsFor(eventA!.id);
    const element = await actionsForA.addElement({
      event_id: eventA!.id,
      room_id: room!.id,
      element_type: "stage",
      x_cm: 0,
      y_cm: 0,
      width_cm: 100,
      length_cm: 100,
    });

    const actionsForB = coupleSeatingActionsFor(eventB!.id);
    await expect(actionsForB.moveElement(element.id, 10, 10)).rejects.toThrow("Element not found in draft.");

    await admin.from("venues").delete().eq("id", venueA!.id);
  });

  it("rejects reading or initializing a room that belongs to a different event/venue", async () => {
    const { data: venueA } = await admin.from("venues").insert({ name: "Room Guard Venue A" }).select().single();
    const { data: eventA } = await admin
      .from("events")
      .insert({ venue_id: venueA!.id, couple_names: "A", event_date: "2026-12-23" })
      .select()
      .single();

    const { data: venueB } = await admin.from("venues").insert({ name: "Room Guard Venue B" }).select().single();
    const { data: foreignRoom } = await admin
      .from("rooms")
      .insert({ venue_id: venueB!.id, name: "Foreign Room" })
      .select()
      .single();
    const { data: eventB } = await admin
      .from("events")
      .insert({ venue_id: venueB!.id, couple_names: "B", event_date: "2026-12-24" })
      .select()
      .single();
    await admin.from("event_rooms").insert({ event_id: eventB!.id, room_id: foreignRoom!.id });

    // eventA's couple never had this room assigned to them; venueB's room is
    // foreign to venueA/eventA entirely.
    const actionsForA = coupleSeatingActionsFor(eventA!.id);
    const expectedError = "Room is not assigned to this event.";

    await expect(actionsForA.listFixedElements(foreignRoom!.id)).rejects.toThrow(expectedError);
    await expect(actionsForA.listLayoutElements(eventA!.id, foreignRoom!.id)).rejects.toThrow(expectedError);
    await expect(actionsForA.initializeFromStandard(eventA!.id, foreignRoom!.id)).rejects.toThrow(expectedError);
    await expect(actionsForA.revertToStandard(eventA!.id, foreignRoom!.id)).rejects.toThrow(expectedError);
    await expect(actionsForA.captureSnapshot(eventA!.id, foreignRoom!.id)).rejects.toThrow(expectedError);
    await expect(actionsForA.undo(eventA!.id, foreignRoom!.id)).rejects.toThrow(expectedError);

    await admin.from("venues").delete().eq("id", venueA!.id);
    await admin.from("venues").delete().eq("id", venueB!.id);
  });

  it("surfaces the real database error instead of masking it as an authorization failure", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Seating Error Surface Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Error & Surface", event_date: "2026-12-27" })
      .select()
      .single();

    const actions = coupleSeatingActionsFor(event!.id);

    // A malformed room id makes Postgres reject the query outright (invalid
    // uuid syntax) rather than simply returning no rows — this must surface
    // as that real error, not get relabeled as "Room is not assigned to this
    // event.", which would hide a genuine DB failure behind a misleading
    // authorization message.
    await expect(actions.listFixedElements("not-a-valid-uuid")).rejects.not.toThrow(
      "Room is not assigned to this event."
    );

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("rejects addElement when table_type_id belongs to a different room than room_id", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Couple Seating Table Type Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Room" }).select().single();
    const { data: otherRoom } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Other Room" }).select().single();
    const { data: foreignTableType } = await admin
      .from("table_types")
      .insert({ room_id: otherRoom!.id, name: "Foreign Table", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 5 })
      .select()
      .single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Couple & Table Type", event_date: "2026-12-25" })
      .select()
      .single();
    await admin.from("event_rooms").insert({ event_id: event!.id, room_id: room!.id });

    const actions = coupleSeatingActionsFor(event!.id);

    await expect(
      actions.addElement({
        event_id: event!.id,
        room_id: room!.id,
        table_type_id: foreignTableType!.id,
        element_type: "table",
        x_cm: 0,
        y_cm: 0,
        width_cm: 150,
        length_cm: 150,
      })
    ).rejects.toThrow("Table type does not belong to this room.");

    const { data: rows } = await admin.from("event_layout_elements").select("id").eq("event_id", event!.id);
    expect(rows).toHaveLength(0);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("keeps draft edits private until confirmed, then pushes them to event_layout_elements", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Confirm Flow Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Room" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Confirm & Flow", event_date: "2026-12-26" })
      .select()
      .single();
    await admin.from("event_rooms").insert({ event_id: event!.id, room_id: room!.id });

    const actions = coupleSeatingActionsFor(event!.id);

    expect(await actions.getConfirmedAt!(event!.id, room!.id)).toBeNull();

    const created = await actions.addElement({
      event_id: event!.id,
      room_id: room!.id,
      element_type: "stage",
      x_cm: 0,
      y_cm: 0,
      width_cm: 100,
      length_cm: 100,
    });

    // Still private: nothing landed in event_layout_elements yet.
    const { data: beforeConfirm } = await admin.from("event_layout_elements").select("id").eq("event_id", event!.id);
    expect(beforeConfirm).toHaveLength(0);

    await actions.confirm!(event!.id, room!.id);

    const confirmedAt = await actions.getConfirmedAt!(event!.id, room!.id);
    expect(confirmedAt).not.toBeNull();

    const { data: afterConfirm } = await admin
      .from("event_layout_elements")
      .select("id, x_cm, y_cm")
      .eq("event_id", event!.id);
    expect(afterConfirm).toHaveLength(1);
    expect(afterConfirm![0].x_cm).toBe(0);

    // Move the draft element after confirming — staff's copy shouldn't change.
    await actions.moveElement(created.id, 50, 50);
    const { data: stillConfirmedCopy } = await admin
      .from("event_layout_elements")
      .select("x_cm, y_cm")
      .eq("event_id", event!.id)
      .single();
    expect(stillConfirmedCopy!.x_cm).toBe(0);

    await actions.unconfirm!(event!.id, room!.id);
    expect(await actions.getConfirmedAt!(event!.id, room!.id)).toBeNull();

    // Unconfirm doesn't touch staff's existing copy.
    const { data: afterUnconfirm } = await admin
      .from("event_layout_elements")
      .select("x_cm, y_cm")
      .eq("event_id", event!.id)
      .single();
    expect(afterUnconfirm!.x_cm).toBe(0);

    await actions.confirm!(event!.id, room!.id);
    const { data: afterReconfirm } = await admin
      .from("event_layout_elements")
      .select("x_cm, y_cm")
      .eq("event_id", event!.id)
      .single();
    expect(afterReconfirm!.x_cm).toBe(50);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
