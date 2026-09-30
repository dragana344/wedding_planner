import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";
import { venueHistoryActions } from "@/lib/venue/floorplan-history";
import { replaceTableSeats } from "@/lib/seating/seats";
import { updateEvent } from "@/lib/venue/events";

// Follow-ups to the S3 review: a hall taken off an event frees its seats
// (M2); the couple's quick edits in parallel never overwrite each other (I5).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `s3follow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let venueId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

async function room(name: string) {
  const id = (await must(admin.from("rooms").insert({ venue_id: venueId, name }).select("id").single())).id;
  const tt = (await must(
    admin.from("table_types").insert({ room_id: id, name: "R", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 30 }).select("id").single(),
  )).id;
  return { id, tt };
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: RUN }).select("id").single())).id;
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("M2: taking a hall off an event", () => {
  it("frees the seats in that hall only, and guest_seat stops naming it", async () => {
    const big = await room("Голема");
    const small = await room("Мала");
    const eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-12-05" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert([{ event_id: eventId, room_id: big.id }, { event_id: eventId, room_id: small.id }]));
    const guest = (await must(admin.from("event_guests").insert({ event_id: eventId, full_name: "Ана", party_size: 2 }).select("id").single())).id;
    for (const r of [big, small]) {
      const table = (await must(
        admin.from("event_layout_elements").insert({ event_id: eventId, room_id: r.id, element_type: "table", table_type_id: r.tt, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 }).select("id").single(),
      )).id;
      await must(admin.from("event_seat_assignments").insert({ event_id: eventId, room_id: r.id, layout_element_id: table, seat_number: 1, guest_id: guest }));
    }
    await must(admin.from("event_rooms").delete().eq("event_id", eventId).eq("room_id", small.id));
    const seats = await must(admin.from("event_seat_assignments").select("room_id").eq("event_id", eventId));
    expect(seats).toEqual([{ room_id: big.id }]);
    const where = await must(admin.rpc("guest_seat", { p_guest_id: guest }));
    expect((where as { room_name: string }[]).map((w) => w.room_name)).toEqual(["Голема"]);
  });
});

describe("M2: saving the event form", () => {
  it("keeps the seats (and the layout claim) of halls the event still uses", async () => {
    const hall = await room(`Форма ${RUN}`);
    const other = await room(`Форма2 ${RUN}`);
    const eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-12-09" }).select("id").single())).id;
    const claimed = new Date().toISOString();
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: hall.id, layout_initialized_at: claimed }));
    const table = (await must(
      admin.from("event_layout_elements").insert({ event_id: eventId, room_id: hall.id, element_type: "table", table_type_id: hall.tt, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 }).select("id").single(),
    )).id;
    await must(admin.from("event_seat_assignments").insert({ event_id: eventId, room_id: hall.id, layout_element_id: table, seat_number: 1, guest_name: "Останува" }));

    const base = { couple_names: RUN, event_date: "2027-12-09", start_time: null, end_time: null, status: "confirmed" as const, event_type: "wedding" as const, guest_count_estimate: null, menu_template_id: null };
    await updateEvent(eventId, venueId, { ...base, room_ids: [hall.id, other.id] });
    expect(await must(admin.from("event_seat_assignments").select("guest_name").eq("event_id", eventId))).toEqual([{ guest_name: "Останува" }]);
    const rooms = await must(admin.from("event_rooms").select("room_id, layout_initialized_at").eq("event_id", eventId).order("room_id"));
    expect(rooms.find((r) => r.room_id === hall.id)!.layout_initialized_at).not.toBeNull();
    expect(rooms).toHaveLength(2);

    await updateEvent(eventId, venueId, { ...base, room_ids: [other.id] });
    expect(await must(admin.from("event_seat_assignments").select("id").eq("event_id", eventId))).toEqual([]);
  });
});

describe("I5: parallel edits by the couple", () => {
  it("ten moves at once all land, and each is one undo step", async () => {
    const r = await room(`Паралелна ${RUN}`);
    const eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-12-06" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: r.id, layout_initialized_at: new Date().toISOString() }));
    const actions = coupleSeatingActionsFor(eventId);
    const tables = [];
    for (let i = 0; i < 10; i++) {
      tables.push(await actions.addElement({ event_id: eventId, room_id: r.id, element_type: "table", table_type_id: r.tt, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 }));
    }
    await Promise.all(tables.map((t, i) => actions.moveElement(t.id, 100 + i, 200 + i)));
    const layout = await actions.listLayoutElements(eventId, r.id);
    for (const [i, t] of tables.entries()) {
      expect(layout.find((e) => e.id === t.id), `table ${i}`).toMatchObject({ x_cm: 100 + i, y_cm: 200 + i });
    }
    const ev = await must(admin.from("events").select("seating_history").eq("id", eventId).single());
    expect((ev.seating_history as Record<string, { past: unknown[] }>)[r.id].past).toHaveLength(20); // 10 adds + 10 moves
  }, 60_000);
});

describe("M4: a change that fails leaves no undo step", () => {
  it("couple: moving a table that does not exist, or a refused seat save", async () => {
    const r = await room(`M4 ${RUN}`);
    const eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-12-07" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: r.id, layout_initialized_at: new Date().toISOString() }));
    const actions = coupleSeatingActionsFor(eventId);
    const table = await actions.addElement({ event_id: eventId, room_id: r.id, element_type: "table", table_type_id: r.tt, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 });
    const before = await actions.getHistoryState!(eventId, r.id);
    const history = async () => (await must(admin.from("events").select("seating_history").eq("id", eventId).single())).seating_history;
    const snapshot = JSON.stringify(await history());
    await expect(actions.moveElement(randomUUID(), 1, 1)).rejects.toThrow();
    await expect(replaceTableSeats(eventId, r.id, table.id, [{ seatNumber: 99, guestName: "Надвор" }], { recordHistory: true })).rejects.toThrow();
    expect(JSON.stringify(await history())).toBe(snapshot);
    expect(await actions.getHistoryState!(eventId, r.id)).toEqual(before);
  });

  it("staff: a move that fails records nothing", async () => {
    const r = await room(`M4s ${RUN}`);
    const eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: RUN, event_date: "2027-12-08" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: r.id }));
    const table = (await must(
      admin.from("event_layout_elements").insert({ event_id: eventId, room_id: r.id, element_type: "table", table_type_id: r.tt, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 }).select("id").single(),
    )).id;
    // A width the table's check constraint refuses.
    await expect(venueHistoryActions.resizeElement(table, -5, 10)).rejects.toThrow();
    expect(await venueHistoryActions.getHistoryState!(eventId, r.id)).toEqual({ canUndo: false, canRedo: false });
  });
});
