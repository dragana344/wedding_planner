import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// S3 task 2 (migration 0071): replace one table's seats atomically, and let
// venue staff read the seating (with guest names) of their own events only.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const RUN = `seatrpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "seat-rpcs-password-123";

interface Fixture { venueId: string; roomId: string; eventId: string; tableId: string; guestId: string; userId: string; email: string }
let A: Fixture;
let B: Fixture;
let staffA: SupabaseClient;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

async function fixture(tag: string): Promise<Fixture> {
  const venue = await must(admin.from("venues").insert({ name: `${RUN} ${tag}` }).select("id").single());
  const room = await must(admin.from("rooms").insert({ venue_id: venue.id, name: `Сала ${tag}` }).select("id").single());
  const tt = await must(
    admin.from("table_types")
      .insert({ room_id: room.id, name: "Round 4", shape: "round", seats: 4, width_cm: 150, length_cm: 150, quantity: 5 })
      .select("id").single(),
  );
  const event = await must(
    admin.from("events").insert({ venue_id: venue.id, couple_names: `${RUN} ${tag}`, event_date: "2027-09-01" }).select("id").single(),
  );
  await must(admin.from("event_rooms").insert({ event_id: event.id, room_id: room.id }));
  const table = await must(
    admin.from("event_layout_elements")
      .insert({ event_id: event.id, room_id: room.id, element_type: "table", table_type_id: tt.id, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select("id").single(),
  );
  const guest = await must(admin.from("event_guests").insert({ event_id: event.id, full_name: `Гостин ${tag}` }).select("id").single());
  const email = `${RUN}-${tag.toLowerCase()}@test.local`;
  const { data: user, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await must(admin.from("venue_staff").insert({ user_id: user.user!.id, venue_id: venue.id }));
  return { venueId: venue.id, roomId: room.id, eventId: event.id, tableId: table.id, guestId: guest.id, userId: user.user!.id, email };
}

beforeAll(async () => {
  [A, B] = await Promise.all([fixture("A"), fixture("B")]);
  staffA = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await staffA.auth.signInWithPassword({ email: A.email, password: PASSWORD });
  if (error) throw error;
}, 60_000);

afterAll(async () => {
  await staffA?.auth.signOut();
  for (const f of [A, B]) if (f) await admin.auth.admin.deleteUser(f.userId);
  await admin.from("venues").delete().in("id", [A?.venueId, B?.venueId].filter(Boolean));
});

function replace(f: Fixture, seats: unknown[]) {
  return admin.rpc("replace_table_seats", { p_event_id: f.eventId, p_room_id: f.roomId, p_element_id: f.tableId, p_seats: seats });
}

describe("seat RPCs (0071)", () => {
  it("replace_table_seats swaps a table's seats in one step", async () => {
    await must(replace(A, [{ seat_number: 1, guest_name: "Прв" }, { seat_number: 2, guest_name: "Втор" }]));
    await must(replace(A, [{ seat_number: 3, guest_id: A.guestId }]));
    const rows = await must(admin.from("event_seat_assignments").select("seat_number, guest_id").eq("layout_element_id", A.tableId));
    expect(rows).toEqual([{ seat_number: 3, guest_id: A.guestId }]);
  });

  it("replace_table_seats leaves the old seats when one new seat is invalid", async () => {
    await must(replace(A, [{ seat_number: 1, guest_name: "Стар" }]));
    const { error } = await replace(A, [{ seat_number: 2, guest_name: "Нов" }, { seat_number: 99, guest_name: "Лош" }]);
    expect(error?.code).toBe("23514");
    const rows = await must(admin.from("event_seat_assignments").select("guest_name").eq("layout_element_id", A.tableId));
    expect(rows).toEqual([{ guest_name: "Стар" }]);
  });

  it("replace_table_seats is server-only", async () => {
    const { error } = await staffA.rpc("replace_table_seats", { p_event_id: A.eventId, p_room_id: A.roomId, p_element_id: A.tableId, p_seats: [] });
    expect(error?.code).toBe("42501");
  });

  it("event_seat_list names linked guests and free-text seats", async () => {
    await must(replace(A, [{ seat_number: 1, guest_id: A.guestId }, { seat_number: 2, guest_name: "Баба Марија" }]));
    const rows = await must(staffA.rpc("event_seat_list", { p_event_id: A.eventId, p_room_id: A.roomId }));
    expect(rows).toEqual([
      { element_id: A.tableId, seat_number: 1, guest_id: A.guestId, display_name: "Гостин A" },
      { element_id: A.tableId, seat_number: 2, guest_id: null, display_name: "Баба Марија" },
    ]);
  });

  it("event_seat_list and event_room_tables_for_staff refuse another venue and anon", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    for (const fn of ["event_seat_list", "event_room_tables_for_staff"]) {
      expect((await staffA.rpc(fn, { p_event_id: B.eventId, p_room_id: B.roomId })).error?.code, fn).toBe("42501");
      expect((await anon.rpc(fn, { p_event_id: A.eventId, p_room_id: A.roomId })).error?.code, fn).toBe("42501");
    }
  });

  it("event_room_tables_for_staff numbers the staff's own tables", async () => {
    const rows = await must(staffA.rpc("event_room_tables_for_staff", { p_event_id: A.eventId, p_room_id: A.roomId }));
    expect(rows).toEqual([{ element_id: A.tableId, table_type_id: expect.any(String), label: null, ord: 1, capacity: 4 }]);
  });

  it("seats_affected_by_table_type answers staff for their own tables only", async () => {
    const { data: ttA } = await admin.from("table_types").select("id").eq("room_id", A.roomId).single();
    const { data: ttB } = await admin.from("table_types").select("id").eq("room_id", B.roomId).single();
    const own = await staffA.rpc("seats_affected_by_table_type", { p_table_type_id: ttA!.id, p_seats: 1 });
    expect(own.error).toBeNull();
    expect(typeof own.data).toBe("number");
    const foreign = await staffA.rpc("seats_affected_by_table_type", { p_table_type_id: ttB!.id, p_seats: 1 });
    expect(foreign.error?.code).toBe("42501");
  });

  it("restore_staff_layout cannot touch another venue's room", async () => {
    await must(replace(B, [{ seat_number: 1, guest_name: "Туѓ" }]));
    await staffA.rpc("restore_staff_layout", { p_event_id: B.eventId, p_room_id: B.roomId, p_elements: [], p_seats: [] });
    const { data: tables } = await admin.from("event_layout_elements").select("id").eq("event_id", B.eventId);
    expect(tables).toHaveLength(1);
    const { data: seats } = await admin.from("event_seat_assignments").select("id").eq("event_id", B.eventId);
    expect(seats).toHaveLength(1);
  });
});
