import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// S3 task 6 (migration 0073): real hall elements — couple table, head table,
// entrance, WC, music, photo stage — and table numbering that skips the
// special tables.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `eltypes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let venueId: string;
let roomId: string;
let roundId: string;
let headId: string;
let eventId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

function table(extra: Record<string, unknown>) {
  return { event_id: eventId, room_id: roomId, element_type: "table", table_type_id: roundId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150, ...extra };
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: RUN }).select("id").single())).id;
  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала" }).select("id").single())).id;
  roundId = (await must(
    admin.from("table_types").insert({ room_id: roomId, name: "Округла 10", shape: "round", seats: 10, width_cm: 180, length_cm: 180, quantity: 50 }).select("id").single(),
  )).id;
  headId = (await must(
    admin.from("table_types").insert({ room_id: roomId, name: "Главна", shape: "rectangular", seats: 12, width_cm: 600, length_cm: 90, quantity: 1 }).select("id").single(),
  )).id;
  eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-10-05" }).select("id").single())).id;
  await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("element types (0073)", () => {
  it("accepts entrance and WC as fixed elements, music and photo stage as movable ones", async () => {
    for (const element_type of ["entrance", "wc", "pillar"]) {
      const { error } = await admin.from("room_fixed_elements").insert({ room_id: roomId, element_type, x_cm: 0, y_cm: 0, width_cm: 50, height_cm: 50 });
      expect(error, element_type).toBeNull();
    }
    for (const element_type of ["music", "photo_stage", "dance_floor", "bar_movable"]) {
      const { error } = await admin.from("room_layout_elements").insert({ room_id: roomId, element_type, x_cm: 0, y_cm: 0, width_cm: 200, length_cm: 200 });
      expect(error, element_type).toBeNull();
      const ev = await admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, element_type, x_cm: 0, y_cm: 0, width_cm: 200, length_cm: 200 });
      expect(ev.error, element_type).toBeNull();
    }
    const bad = await admin.from("room_layout_elements").insert({ room_id: roomId, element_type: "spaceship", x_cm: 0, y_cm: 0, width_cm: 1, length_cm: 1 });
    expect(bad.error?.code).toBe("23514");
  });

  it("gives every table a role, 'guest' by default, and refuses unknown roles", async () => {
    const t = await must(admin.from("event_layout_elements").insert(table({})).select("table_role").single());
    expect(t.table_role).toBe("guest");
    const bad = await admin.from("event_layout_elements").insert(table({ table_role: "vip" }));
    expect(bad.error?.code).toBe("23514");
    const room = await must(
      admin.from("room_layout_elements")
        .insert({ room_id: roomId, element_type: "table", table_type_id: headId, table_role: "head", x_cm: 0, y_cm: 0, width_cm: 600, length_cm: 90 })
        .select("table_role").single(),
    );
    expect(room.table_role).toBe("head");
    await must(admin.from("event_layout_elements").delete().eq("event_id", eventId));
  });

  it("numbers only guest tables; special tables are named by role, type-name labels are ignored", async () => {
    await must(admin.from("event_layout_elements").insert(table({ table_role: "couple", table_type_id: headId })));
    await must(admin.from("event_layout_elements").insert(table({ label: "Округла 10" })));
    await must(admin.from("event_layout_elements").insert(table({ label: "Кумови" })));
    await must(admin.from("event_layout_elements").insert(table({})));
    const rows = await must(admin.rpc("event_room_tables", { p_event_id: eventId, p_room_id: roomId }));
    const byLabel = (rows as { label: string | null; ord: number }[]).map((r) => [r.label, r.ord]);
    expect(byLabel).toEqual([
      ["Маса на младенците", 0],
      [null, 1],
      ["Кумови", 2],
      [null, 3],
    ]);
  });

  it("confirm_event_seating keeps table_role", async () => {
    const [el] = await must(admin.from("event_layout_elements").select("id").eq("event_id", eventId).eq("table_role", "couple"));
    await must(admin.rpc("confirm_event_seating", {
      p_event_id: eventId,
      p_room_id: roomId,
      p_elements: [{
        id: el.id, element_type: "table", table_type_id: headId, x_cm: 0, y_cm: 0, width_cm: 600, length_cm: 90,
        rotation_deg: 0, label: null, group_id: null, table_role: "couple",
      }],
      p_confirmed_at: new Date().toISOString(),
    }));
    const after = await must(admin.from("event_layout_elements").select("table_role").eq("id", el.id).single());
    expect(after.table_role).toBe("couple");
  });

  it("guest_seat names the couple's table by its role", async () => {
    const [el] = await must(admin.from("event_layout_elements").select("id").eq("event_id", eventId).eq("table_role", "couple"));
    const guest = await must(admin.from("event_guests").insert({ event_id: eventId, full_name: "Кума" }).select("id").single());
    await must(admin.from("event_seat_assignments").insert({ event_id: eventId, room_id: roomId, layout_element_id: el.id, seat_number: 3, guest_id: guest.id }));
    expect(await must(admin.rpc("guest_seat", { p_guest_id: guest.id }))).toEqual([
      { table_label: "Маса на младенците", seat_number: 3, room_name: "Сала" },
    ]);
  });
});
