import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createReservation, updateReservationStatus, type ReservationInput } from "@/lib/venue/reservations";

// DATA-012: the database, not only the app's pre-check, refuses two active
// reservations holding the same table at overlapping times.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let venueId: string;
let roomId: string;
let tableId: string;
let otherTableId: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "No Overlap Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: room } = await admin.from("rooms").insert({ venue_id: venueId, name: "Hall" }).select("id").single();
  roomId = room!.id;
  const { data: tables } = await admin
    .from("room_layout_elements")
    .insert([
      { room_id: roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 },
      { room_id: roomId, element_type: "table", x_cm: 300, y_cm: 0, width_cm: 150, length_cm: 150 },
    ])
    .select("id");
  [tableId, otherTableId] = tables!.map((t) => t.id);
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

function booking(overrides: Partial<ReservationInput>): ReservationInput {
  return {
    venue_id: venueId,
    room_id: roomId,
    guest_name: "Guest",
    phone: "070000000",
    date: "2027-01-15",
    start_time: "19:00",
    end_time: "22:00",
    party_size: 2,
    table_ids: [tableId],
    ...overrides,
  };
}

/** Inserts straight into the tables, skipping the app's pre-check, as a racing request would. */
async function rawBooking(date: string, start: string, end: string | null, table: string) {
  const { data: r, error } = await admin
    .from("reservations")
    .insert({ venue_id: venueId, room_id: roomId, guest_name: "Raw", phone: "070", date, start_time: start, end_time: end, party_size: 2 })
    .select("id")
    .single();
  if (error) throw error;
  const { error: tableError } = await admin.from("reservation_tables").insert({ reservation_id: r.id, layout_element_id: table });
  return { id: r.id, error: tableError };
}

describe("reservation overlap constraint (DATA-012)", () => {
  it("lets exactly one of two concurrent overlapping bookings through", async () => {
    const results = await Promise.allSettled([
      createReservation(booking({ guest_name: "First", date: "2027-02-01" }), admin),
      createReservation(booking({ guest_name: "Second", date: "2027-02-01", start_time: "20:00", end_time: "23:00" }), admin),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.message).toBe("Една или повеќе од избраните маси се веќе резервирани за тоа време.");

    const { data } = await admin.from("reservations").select("id").eq("room_id", roomId).eq("date", "2027-02-01");
    expect(data).toHaveLength(1);
  });

  it("refuses an overlap that bypasses the app check, including across midnight", async () => {
    const first = await rawBooking("2027-03-01", "22:00", "02:00", tableId);
    expect(first.error).toBeNull();
    const nextMorning = await rawBooking("2027-03-02", "01:00", "03:00", tableId);
    expect(nextMorning.error?.code).toBe("23P01");
  });

  it("still allows back-to-back bookings, other tables, and open-ended bookings that don't overlap", async () => {
    expect((await rawBooking("2027-04-01", "12:00", "15:00", tableId)).error).toBeNull();
    expect((await rawBooking("2027-04-01", "15:00", "18:00", tableId)).error).toBeNull();
    expect((await rawBooking("2027-04-01", "12:00", "15:00", otherTableId)).error).toBeNull();
    expect((await rawBooking("2027-04-01", "18:00", null, tableId)).error).toBeNull(); // 18:00-21:00
    expect((await rawBooking("2027-04-01", "20:00", "23:00", tableId)).error?.code).toBe("23P01");
  });

  it("frees the table when a reservation is cancelled or completed", async () => {
    const r = await createReservation(booking({ date: "2027-05-01" }), admin);
    await updateReservationStatus(r.id, "cancelled", admin);
    const again = await createReservation(booking({ date: "2027-05-01", guest_name: "Rebooked" }), admin);
    expect(again.id).toBeTruthy();

    await updateReservationStatus(again.id, "completed", admin);
    expect((await rawBooking("2027-05-01", "19:30", "21:00", tableId)).error).toBeNull();
  });

  it("re-activating a cancelled reservation into a taken slot is refused", async () => {
    const cancelled = await createReservation(booking({ date: "2027-06-01" }), admin);
    await updateReservationStatus(cancelled.id, "cancelled", admin);
    await createReservation(booking({ date: "2027-06-01", guest_name: "Took the slot" }), admin);
    await expect(updateReservationStatus(cancelled.id, "reserved", admin)).rejects.toMatchObject({ code: "23P01" });
  });
});
