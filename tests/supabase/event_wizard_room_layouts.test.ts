// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// 0141: the event-creation wizard resolves each selected room's starting
// layout explicitly (p_room_layouts) instead of create_event_full always
// silently copying the room's live template. The chosen elements must seed
// BOTH event_layout_elements (what the staff seating editor initializes
// from) and events.seating_baseline (what the couple reads) with the same
// ids, and event_rooms.layout_initialized_at must be claimed so the staff
// side's lazy copy-from-room-template never fires afterwards.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

let venueId: string;
let roomA: string;
let roomB: string;

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: `Room Layouts Venue ${stamp}` }).select("id").single())).id;
  roomA = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала А" }).select("id").single())).id;
  roomB = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала Б" }).select("id").single())).id;
}, 60_000);
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

function createFull(over: Record<string, unknown>) {
  return admin.rpc("create_event_full", {
    p_venue_id: venueId,
    p_couple_names: "Ана и Марко",
    p_event_date: "2030-09-01",
    p_start_time: "18:00",
    p_end_time: "23:00",
    p_event_type: "wedding",
    p_status: "preparation",
    p_guest_count_estimate: 50,
    p_room_ids: [roomA],
    p_contact_email: null,
    p_contact_email_2: null,
    p_contact_phone: null,
    p_total_price: null,
    p_deposit_paid: null,
    p_username: `room-layouts-${stamp}-${Math.random().toString(36).slice(2)}`,
    p_password: "long-enough-password",
    p_menu_template_ids: [],
    ...over,
  });
}

describe("create_event_full p_room_layouts (0141)", () => {
  it("seeds event_layout_elements from the given elements, claims layout_initialized_at, and mirrors the same ids into seating_baseline", async () => {
    const elements = [
      { element_type: "table", table_type_id: null, x_cm: 70, y_cm: 80, width_cm: 160, length_cm: 160, rotation_deg: 0, label: "Маса 1", group_id: null, table_role: "guest" },
      { element_type: "table", table_type_id: null, x_cm: 300, y_cm: 80, width_cm: 160, length_cm: 160, rotation_deg: 90, label: "Маса 2", group_id: null, table_role: "guest" },
    ];
    const eventId = await must(createFull({ p_room_layouts: { [roomA]: elements } }));

    const rows = await must(
      admin.from("event_layout_elements").select("id, x_cm, y_cm, width_cm, length_cm, rotation_deg, label, table_role").eq("event_id", eventId).order("created_at"),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ x_cm: 70, y_cm: 80, label: "Маса 1" });
    expect(rows[1]).toMatchObject({ x_cm: 300, y_cm: 80, label: "Маса 2" });

    const eventRoom = await must(admin.from("event_rooms").select("layout_initialized_at").eq("event_id", eventId).eq("room_id", roomA).single());
    expect(eventRoom.layout_initialized_at).not.toBeNull();

    const event = await must(admin.from("events").select("seating_baseline").eq("id", eventId).single());
    const baseline = event.seating_baseline as Record<string, { id: string; x_cm: number; label: string }[]>;
    expect(baseline[roomA]).toHaveLength(2);
    expect(baseline[roomA].map((e) => e.id).sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it("an empty array for a room is a deliberately blank layout, not the room's live template", async () => {
    await must(admin.from("room_layout_elements").insert({ room_id: roomA, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 160, length_cm: 160, label: "Жива маса (не треба да се копира)" }));
    const eventId = await must(createFull({ p_room_layouts: { [roomA]: [] } }));

    const rows = await must(admin.from("event_layout_elements").select("id").eq("event_id", eventId));
    expect(rows).toEqual([]);
    const event = await must(admin.from("events").select("seating_baseline").eq("id", eventId).single());
    expect((event.seating_baseline as Record<string, unknown[]>)[roomA]).toEqual([]);

    await admin.from("room_layout_elements").delete().eq("room_id", roomA);
  });

  it("omitting p_room_layouts keeps the old behaviour: auto-copies the room's live template", async () => {
    await must(admin.from("room_layout_elements").insert({ room_id: roomA, element_type: "table", x_cm: 15, y_cm: 15, width_cm: 160, length_cm: 160, label: "Стандардна" }));
    const eventId = await must(createFull({}));

    const rows = await must(admin.from("event_layout_elements").select("id").eq("event_id", eventId));
    expect(rows).toEqual([]); // the staff editor's lazy copy hasn't run yet — unchanged pre-existing behaviour
    const event = await must(admin.from("events").select("seating_baseline").eq("id", eventId).single());
    expect((event.seating_baseline as Record<string, { label: string }[]>)[roomA]).toMatchObject([{ label: "Стандардна" }]);

    await admin.from("room_layout_elements").delete().eq("room_id", roomA);
  });

  it("refuses a p_room_layouts missing an entry for one of the selected rooms", async () => {
    const { error } = await createFull({ p_room_ids: [roomA, roomB], p_room_layouts: { [roomA]: [] } });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/p_room_layouts/);
  });
});
