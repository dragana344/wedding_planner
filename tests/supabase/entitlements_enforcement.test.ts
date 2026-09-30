import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const LOCKED = "Оваа функција не е вклучена во вашиот пакет.";
let planId: string;
let venueId: string;
let eventId: string;
let roomId: string;

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `Tight ${Date.now()}` }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "max_guests", enabled: true, limit_value: 2 },
    { plan_id: planId, feature_key: "max_rooms", enabled: true, limit_value: 1 },
    { plan_id: planId, feature_key: "max_active_events", enabled: true, limit_value: 1 },
    { plan_id: planId, feature_key: "invitation", enabled: true },
  ]);
  venueId = (await admin.from("venues").insert({ name: "Tight Venue", plan_id: planId }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Tight & Test", event_date: "2028-03-01" }).select("id").single()).data!.id;
  roomId = (await admin.from("rooms").insert({ venue_id: venueId, name: "Only room" }).select("id").single()).data!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("limits (spec §4.4)", () => {
  it("refuses the guest over the limit with the Macedonian message", async () => {
    expect((await admin.from("event_guests").insert({ event_id: eventId, full_name: "Прв" })).error).toBeNull();
    expect((await admin.from("event_guests").insert({ event_id: eventId, full_name: "Втор" })).error).toBeNull();
    const { error } = await admin.from("event_guests").insert({ event_id: eventId, full_name: "Трет" });
    expect(error?.code).toBe("P0001");
    expect(error?.message).toBe("Достигнат е лимитот од 2 гости за овој настан.");
  });

  it("keeps existing guests over a lowered limit readable and updatable (D7)", async () => {
    await admin.from("plan_features").update({ limit_value: 1 }).eq("plan_id", planId).eq("feature_key", "max_guests");
    const { data } = await admin.from("event_guests").select("id").eq("event_id", eventId);
    expect(data).toHaveLength(2);
    expect((await admin.from("event_guests").update({ rsvp_status: "confirmed" }).eq("event_id", eventId)).error).toBeNull();
  });

  it("refuses a second room and a second active event", async () => {
    expect((await admin.from("rooms").insert({ venue_id: venueId, name: "Two" })).error?.message).toBe("Достигнат е лимитот од 1 простории.");
    expect((await admin.from("events").insert({ venue_id: venueId, couple_names: "Second & Test", event_date: "2028-03-02" })).error?.message).toBe("Достигнат е лимитот од 1 активни настани.");
  });

  it("counts only active events", async () => {
    await admin.from("events").update({ status: "completed" }).eq("id", eventId);
    expect((await admin.from("events").insert({ venue_id: venueId, couple_names: "Third & Test", event_date: "2028-03-03" })).error).toBeNull();
    await admin.from("events").update({ status: "preparation" }).eq("id", eventId).select();
    const { error } = await admin.from("events").update({ status: "confirmed" }).eq("id", eventId);
    expect(error?.message).toBe("Достигнат е лимитот од 1 активни настани.");
  });
});

describe("locked features (spec §4.4)", () => {
  it("refuses reservations, floor plan, showcase, seating and custom menu writes when locked", async () => {
    const r = await admin.from("reservations").insert({ venue_id: venueId, room_id: roomId, guest_name: "X", phone: "070", date: "2028-03-05", start_time: "12:00", party_size: 2 });
    expect(r.error?.message).toBe(LOCKED);
    const fp = await admin.from("room_layout_elements").insert({ room_id: roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 });
    expect(fp.error?.message).toBe(LOCKED);
    const sp = await admin.from("event_showcase_photos").insert({ event_id: eventId, photo_path: `${venueId}/x.jpg` });
    expect(sp.error?.message).toBe(LOCKED);
    const se = await admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 });
    expect(se.error?.message).toBe(LOCKED);
    const dish = await admin.from("menu_items").insert({ venue_id: venueId, tiers: ["everyday"], course: "main", name: "Locked dish" }).select("id").single();
    const cm = await admin.from("event_custom_menu_items").insert({ event_id: eventId, menu_item_id: dish.data!.id });
    expect(cm.error?.message).toBe(LOCKED);
  });

  it("gates invitation templates and photo but keeps a basic invitation", async () => {
    const ok = await admin.from("event_invitations").insert({ event_id: eventId, template_id: "romantic-floral", public_slug: `ent${Date.now()}`.slice(0, 20) });
    expect(ok.error).toBeNull();
    const premium = await admin.from("event_invitations").update({ template_id: "classic-minimal" }).eq("event_id", eventId);
    expect(premium.error?.message).toBe(LOCKED);
    const photo = await admin.from("event_invitations").update({ photo_path: `${eventId}-1.jpg` }).eq("event_id", eventId);
    expect(photo.error?.message).toBe(LOCKED);
  });

  it("unlocking per event lets that event through", async () => {
    await admin.from("event_feature_overrides").insert({ event_id: eventId, feature_key: "seating", enabled: true });
    const se = await admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 });
    expect(se.error).toBeNull();
  });

  it("never blocks deletes (D7)", async () => {
    await admin.from("event_feature_overrides").delete().eq("event_id", eventId);
    expect((await admin.from("event_layout_elements").delete().eq("event_id", eventId)).error).toBeNull();
  });

  it("never blocks a table_types delete under a locked floor plan (D7, ON DELETE SET NULL cascade)", async () => {
    // Unlock floor_plan just long enough to create a layout element that
    // references a table_type, then lock it again before deleting the
    // table_type: the FK's ON DELETE SET NULL then nulls out
    // room_layout_elements.table_type_id, which must never be refused by a
    // locked plan (Important 2 fix).
    await admin.from("plan_features").insert({ plan_id: planId, feature_key: "floor_plan", enabled: true });
    const tableType = await admin
      .from("table_types")
      .insert({ room_id: roomId, name: "Round 8", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 5 })
      .select("id")
      .single();
    const layoutElement = await admin
      .from("room_layout_elements")
      .insert({ room_id: roomId, element_type: "table", table_type_id: tableType.data!.id, x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 })
      .select("id")
      .single();
    await admin.from("plan_features").update({ enabled: false }).eq("plan_id", planId).eq("feature_key", "floor_plan");

    const del = await admin.from("table_types").delete().eq("id", tableType.data!.id);
    expect(del.error).toBeNull();
    const after = await admin.from("room_layout_elements").select("table_type_id").eq("id", layoutElement.data!.id).single();
    expect(after.data!.table_type_id).toBeNull();
  });
});
