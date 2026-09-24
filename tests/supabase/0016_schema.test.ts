import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueAId: string;
let venueBId: string;
let roomAId: string;
let staffAEmail = "0016-staff-a@test.local";
let staffAPassword = "test-password-123";
let staffAUserId: string;

describe("0016 schema: reservations", () => {
  beforeAll(async () => {
    const { data: venueA } = await admin.from("venues").insert({ name: "0016 Venue A" }).select().single();
    const { data: venueB } = await admin.from("venues").insert({ name: "0016 Venue B" }).select().single();
    venueAId = venueA!.id;
    venueBId = venueB!.id;
    const { data: room } = await admin.from("rooms").insert({ venue_id: venueAId, name: "Hall" }).select().single();
    roomAId = room!.id;

    const { data: userA } = await admin.auth.admin.createUser({
      email: staffAEmail,
      password: staffAPassword,
      email_confirm: true,
    });
    staffAUserId = userA!.user!.id;
    await admin.from("venue_staff").insert({ user_id: staffAUserId, venue_id: venueAId });
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(staffAUserId);
    await admin.from("venues").delete().in("id", [venueAId, venueBId]);
  });

  it("creates a reservation with tables, and enforces the status check constraint", async () => {
    const { data: layoutEl } = await admin
      .from("room_layout_elements")
      .insert({ room_id: roomAId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select()
      .single();

    const { data: reservation, error } = await admin
      .from("reservations")
      .insert({
        venue_id: venueAId,
        room_id: roomAId,
        guest_name: "Ivana Ivanova",
        phone: "+389 70 000 000",
        date: "2026-10-01",
        start_time: "19:00",
        party_size: 4,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(reservation!.status).toBe("reserved");

    const { error: tableError } = await admin
      .from("reservation_tables")
      .insert({ reservation_id: reservation!.id, layout_element_id: layoutEl!.id });
    expect(tableError).toBeNull();

    const { error: badStatusError } = await admin
      .from("reservations")
      .insert({
        venue_id: venueAId,
        room_id: roomAId,
        guest_name: "Bad Status",
        phone: "000",
        date: "2026-10-01",
        start_time: "19:00",
        party_size: 1,
        status: "not-a-real-status",
      });
    expect(badStatusError).not.toBeNull();
  });

  it("lets venue staff manage only their own venue's reservations", async () => {
    const staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await staffClient.auth.signInWithPassword({ email: staffAEmail, password: staffAPassword });

    const { error: ownInsertError } = await staffClient
      .from("reservations")
      .insert({ venue_id: venueAId, room_id: roomAId, guest_name: "Own", phone: "1", date: "2026-10-02", start_time: "12:00", party_size: 2 });
    expect(ownInsertError).toBeNull();

    const { error: foreignInsertError } = await staffClient
      .from("reservations")
      .insert({ venue_id: venueBId, room_id: roomAId, guest_name: "Foreign", phone: "1", date: "2026-10-02", start_time: "12:00", party_size: 2 });
    expect(foreignInsertError).not.toBeNull();

    const { data: ownReservations } = await staffClient.from("reservations").select("id").eq("venue_id", venueAId);
    expect((ownReservations ?? []).length).toBeGreaterThan(0);
    const { data: foreignReservations } = await staffClient.from("reservations").select("id").eq("venue_id", venueBId);
    expect(foreignReservations).toHaveLength(0);
  });

  it("cascades deletes: deleting a reservation removes its reservation_tables rows", async () => {
    const { data: layoutEl } = await admin
      .from("room_layout_elements")
      .insert({ room_id: roomAId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select()
      .single();
    const { data: reservation } = await admin
      .from("reservations")
      .insert({ venue_id: venueAId, room_id: roomAId, guest_name: "Cascade", phone: "1", date: "2026-10-03", start_time: "18:00", party_size: 2 })
      .select()
      .single();
    await admin.from("reservation_tables").insert({ reservation_id: reservation!.id, layout_element_id: layoutEl!.id });

    await admin.from("reservations").delete().eq("id", reservation!.id);
    const { data: remaining } = await admin.from("reservation_tables").select("reservation_id").eq("reservation_id", reservation!.id);
    expect(remaining).toHaveLength(0);
  });
});
