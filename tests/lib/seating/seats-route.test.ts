import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { COUPLE_EVENT_HEADER } from "@/lib/api/handler";
import * as seatsRoute from "@/app/api/couple/seating/seats/route";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";

// S3 task 2: the couple's per-table seat list API.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `seatsroute-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let venueId: string;
let roomId: string;
let tableTypeId: string;
let eventId: string;
let otherEventId: string;
let otherGuestId: string;
let tableIds: [string, string];
let guestId: string;
let familyId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

function draftTable(id: string, label: string | null = null) {
  return {
    id, event_id: eventId, room_id: roomId, element_type: "table", table_type_id: tableTypeId,
    x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150, rotation_deg: 0, label,
  };
}

async function call(method: "GET" | "PUT", opts: { query?: Record<string, string>; body?: unknown; asEvent?: string } = {}) {
  const headers = new Headers({ [COUPLE_EVENT_HEADER]: opts.asEvent ?? eventId });
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  const qs = opts.query ? `?${new URLSearchParams(opts.query)}` : "";
  const handler = method === "GET" ? seatsRoute.GET : seatsRoute.PUT;
  const res = await handler(
    new NextRequest(`http://localhost/api/couple/seating/seats${qs}`, {
      method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    { params: {} },
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const venue = await must(admin.from("venues").insert({ name: `${RUN} venue` }).select("id").single());
  venueId = venue.id;
  const room = await must(admin.from("rooms").insert({ venue_id: venueId, name: "Голема сала" }).select("id").single());
  roomId = room.id;
  const tt = await must(
    admin.from("table_types")
      .insert({ room_id: roomId, name: "Round 4", shape: "round", seats: 4, width_cm: 150, length_cm: 150, quantity: 5 })
      .select("id").single(),
  );
  tableTypeId = tt.id;
  const event = await must(admin.from("events").insert({ venue_id: venueId, couple_names: `${RUN} A`, event_date: "2027-09-01" }).select("id").single());
  eventId = event.id;
  const other = await must(admin.from("events").insert({ venue_id: venueId, couple_names: `${RUN} B`, event_date: "2027-09-02" }).select("id").single());
  otherEventId = other.id;
  await must(admin.from("event_rooms").insert([
    { event_id: eventId, room_id: roomId, layout_initialized_at: new Date().toISOString() },
    { event_id: otherEventId, room_id: roomId, layout_initialized_at: new Date().toISOString() },
  ]));
  tableIds = [randomUUID(), randomUUID()];
  await must(admin.from("events").update({ seating_draft: { [roomId]: [draftTable(tableIds[0]), draftTable(tableIds[1], "Кумови")] } }).eq("id", eventId));
  guestId = (await must(admin.from("event_guests").insert({ event_id: eventId, full_name: "Ана Петровска" }).select("id").single())).id;
  familyId = (await must(admin.from("event_guests").insert({ event_id: eventId, full_name: "Семејство Стојанови", party_size: 3 }).select("id").single())).id;
  otherGuestId = (await must(admin.from("event_guests").insert({ event_id: otherEventId, full_name: "Туѓ гостин" }).select("id").single())).id;
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("/api/couple/seating/seats", () => {
  it("GET lists the room's tables in draft order with numbers, seats and guests", async () => {
    await must(admin.from("event_seat_assignments").delete().eq("event_id", eventId));
    await must(admin.from("event_seat_assignments").insert({
      event_id: eventId, room_id: roomId, layout_element_id: tableIds[0], seat_number: 2, guest_id: familyId,
    }));
    const res = await call("GET", { query: { room_id: roomId } });
    expect(res.status).toBe(200);
    expect(res.json.tables).toEqual([
      { elementId: tableIds[0], label: null, number: 1, capacity: 4 },
      { elementId: tableIds[1], label: "Кумови", number: 2, capacity: 4 },
    ]);
    expect(res.json.seats).toEqual([
      { elementId: tableIds[0], seatNumber: 2, guestId: familyId, guestName: null, displayName: "Семејство Стојанови" },
    ]);
    expect(res.json.guests).toEqual(
      expect.arrayContaining([
        { id: guestId, fullName: "Ана Петровска", partySize: 1, seatsTaken: 0, side: null },
        { id: familyId, fullName: "Семејство Стојанови", partySize: 3, seatsTaken: 1, side: null },
      ]),
    );
  });

  it("PUT replaces one table's list", async () => {
    const res = await call("PUT", {
      body: {
        room_id: roomId, layout_element_id: tableIds[1],
        seats: [{ seat_number: 1, guest_id: guestId }, { seat_number: 4, guest_name: "  Баба Марија " }],
      },
    });
    expect(res.status).toBe(200);
    const rows = await must(admin.from("event_seat_assignments").select("seat_number, guest_id, guest_name").eq("layout_element_id", tableIds[1]).order("seat_number"));
    expect(rows).toEqual([
      { seat_number: 1, guest_id: guestId, guest_name: null },
      { seat_number: 4, guest_id: null, guest_name: "Баба Марија" },
    ]);
  });

  it("PUT explains each refusal with 409", async () => {
    const cases: [unknown[], string][] = [
      [[{ seat_number: 5, guest_name: "Надвор" }], "Столчето е надвор од масата."],
      [[{ seat_number: 1, guest_id: otherGuestId }], "Гостинот не е од овој настан."],
      // Ана already sits at Кумови; her only seat is taken.
      [[{ seat_number: 1, guest_id: guestId }], "Гостинот веќе ги има сите свои места."],
    ];
    for (const [seats, message] of cases) {
      const res = await call("PUT", { body: { room_id: roomId, layout_element_id: tableIds[0], seats } });
      expect(res.status, JSON.stringify(seats)).toBe(409);
      expect(res.json.error).toBe(message);
    }
  });

  it("PUT refuses to overwrite a list another tab saved in the meantime", async () => {
    await must(admin.from("event_seat_assignments").delete().eq("layout_element_id", tableIds[0]));
    const first = await call("PUT", { body: { room_id: roomId, layout_element_id: tableIds[0], seats: [{ seat_number: 2, guest_name: "Таб А" }], expected: [] } });
    expect(first.status).toBe(200);
    // Tab B still thinks the table is empty.
    const stale = await call("PUT", {
      body: { room_id: roomId, layout_element_id: tableIds[0], seats: [{ seat_number: 2, guest_name: "Таб Б" }], expected: [] },
    });
    expect(stale.status).toBe(409);
    expect(stale.json.error).toBe("Листата е сменета на друг уред. Освежете ја и обидете се повторно.");
    const fresh = await call("PUT", {
      body: {
        room_id: roomId, layout_element_id: tableIds[0],
        seats: [{ seat_number: 2, guest_name: "Таб Б" }], expected: [{ seat_number: 2, guest_id: null, guest_name: "Таб А" }],
      },
    });
    expect(fresh.status).toBe(200);
  });

  it("PUT refuses two people on one seat in the same request with 400", async () => {
    const res = await call("PUT", {
      body: { room_id: roomId, layout_element_id: tableIds[0], seats: [{ seat_number: 1, guest_name: "А" }, { seat_number: 1, guest_name: "Б" }] },
    });
    expect(res.status).toBe(400);
  });

  it("deleting a table or reverting to standard frees its seats", async () => {
    const actions = coupleSeatingActionsFor(eventId);
    const extra = await actions.addElement({
      event_id: eventId, room_id: roomId, element_type: "table", table_type_id: tableTypeId,
      x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150,
    });
    await must(admin.from("event_seat_assignments").insert({
      event_id: eventId, room_id: roomId, layout_element_id: extra.id, seat_number: 1, guest_name: "На избришана маса",
    }));
    await actions.deleteElement(extra.id);
    expect(await must(admin.from("event_seat_assignments").select("id").eq("layout_element_id", extra.id))).toEqual([]);

    await must(admin.from("event_seat_assignments").insert({
      event_id: eventId, room_id: roomId, layout_element_id: tableIds[0], seat_number: 3, guest_name: "Пред стандардно",
    }));
    await actions.revertToStandard(eventId, roomId); // the room's standard layout has no tables
    expect(await must(admin.from("event_seat_assignments").select("id").eq("event_id", eventId))).toEqual([]);
    await must(admin.from("events").update({ seating_draft: { [roomId]: [draftTable(tableIds[0]), draftTable(tableIds[1], "Кумови")] } }).eq("id", eventId));
  });

  it("another event's session cannot read or write this room's seats", async () => {
    await must(admin.from("event_rooms").delete().eq("event_id", otherEventId));
    const read = await call("GET", { query: { room_id: roomId }, asEvent: otherEventId });
    expect(read.status).toBe(400);
    const write = await call("PUT", {
      asEvent: otherEventId,
      body: { room_id: roomId, layout_element_id: tableIds[0], seats: [{ seat_number: 3, guest_name: "Упад" }] },
    });
    expect(write.status).toBe(400);
    const rows = await must(admin.from("event_seat_assignments").select("guest_name").eq("guest_name", "Упад"));
    expect(rows).toEqual([]);
  });
});
