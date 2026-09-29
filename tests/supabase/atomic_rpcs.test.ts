import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

// REL-005: each multi-step write is one transaction. Make the last step fail
// and check that the earlier steps did not stick.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let venueId: string;
let roomId: string;
let eventId: string;
let dishA: string;
let dishB: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Atomic Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: room } = await admin.from("rooms").insert({ venue_id: venueId, name: "Hall" }).select("id").single();
  roomId = room!.id;
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "Atomic & Test", event_date: "2027-08-01" })
    .select("id")
    .single();
  eventId = event!.id;
  const { data: dishes } = await admin
    .from("menu_items")
    .insert([
      { venue_id: venueId, tiers: ["everyday"], course: "main", name: "A" },
      { venue_id: venueId, tiers: ["everyday"], course: "dessert", name: "B" },
    ])
    .select("id");
  [dishA, dishB] = dishes!.map((d) => d.id);
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("atomic multi-step writes (REL-005)", () => {
  it("seating confirm: a bad element leaves the previous confirmed layout in place", async () => {
    const good = [{ element_type: "table", table_type_id: null, x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100, rotation_deg: 0, label: "T1" }];
    expect((await admin.rpc("confirm_event_seating", { p_event_id: eventId, p_room_id: roomId, p_elements: good, p_confirmed_at: "2027-01-01T00:00:00.000Z" })).error).toBeNull();

    const bad = [...good, { ...good[0], element_type: "not-a-type" }];
    const { error } = await admin.rpc("confirm_event_seating", { p_event_id: eventId, p_room_id: roomId, p_elements: bad, p_confirmed_at: "2027-02-02T00:00:00.000Z" });
    expect(error).not.toBeNull();

    const { data: rows } = await admin.from("event_layout_elements").select("label").eq("event_id", eventId).eq("room_id", roomId);
    expect(rows).toEqual([{ label: "T1" }]);
    const { data: event } = await admin.from("events").select("seating_confirmed_at").eq("id", eventId).single();
    expect(event!.seating_confirmed_at).toEqual({ [roomId]: "2027-01-01T00:00:00.000Z" });
  });

  it("menu quantities: a bad row keeps the previous quantities", async () => {
    await admin.rpc("replace_menu_item_quantities", { p_event_id: eventId, p_quantities: [{ menu_item_id: dishA, guest_count: 40 }] });
    const { error } = await admin.rpc("replace_menu_item_quantities", {
      p_event_id: eventId,
      p_quantities: [{ menu_item_id: dishA, guest_count: 50 }, { menu_item_id: dishB, guest_count: 0 }],
    });
    expect(error).not.toBeNull();
    const { data } = await admin.from("event_menu_item_quantities").select("menu_item_id, guest_count").eq("event_id", eventId);
    expect(data).toEqual([{ menu_item_id: dishA, guest_count: 40 }]);
  });

  it("custom menu: a bad pick keeps the previous picks and template", async () => {
    await admin.rpc("set_event_menu_custom", { p_event_id: eventId, p_menu_item_ids: [dishA] });
    const { error } = await admin.rpc("set_event_menu_custom", { p_event_id: eventId, p_menu_item_ids: [dishB, randomUUID()] });
    expect(error).not.toBeNull();
    const { data } = await admin.from("event_custom_menu_items").select("menu_item_id").eq("event_id", eventId);
    expect(data).toEqual([{ menu_item_id: dishA }]);
  });

  it("venue provisioning: a failing staff insert leaves no orphan venue", async () => {
    const name = `Orphan check ${randomUUID()}`;
    const { error } = await admin.rpc("provision_venue", { p_user_id: randomUUID(), p_venue_name: name });
    expect(error).not.toBeNull();
    const { data } = await admin.from("venues").select("id").eq("name", name);
    expect(data).toEqual([]);
  });
});
