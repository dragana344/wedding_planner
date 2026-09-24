import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueAId: string;
let venueBId: string;
let roomAId: string;
let roomBId: string;
let reservationAId: string;
let layoutElOnRoomBId: string;
const staffAEmail = "0017-staff-a@test.local";
const staffAPassword = "test-password-123";
let staffAUserId: string;

describe("0017 schema: reservations room/venue ownership check", () => {
  beforeAll(async () => {
    const { data: venueA } = await admin.from("venues").insert({ name: "0017 Venue A" }).select().single();
    const { data: venueB } = await admin.from("venues").insert({ name: "0017 Venue B" }).select().single();
    venueAId = venueA!.id;
    venueBId = venueB!.id;
    const { data: roomA } = await admin.from("rooms").insert({ venue_id: venueAId, name: "Hall A" }).select().single();
    roomAId = roomA!.id;
    const { data: roomB } = await admin.from("rooms").insert({ venue_id: venueBId, name: "Hall B" }).select().single();
    roomBId = roomB!.id;

    const { data: layoutElOnRoomA } = await admin
      .from("room_layout_elements")
      .insert({ room_id: roomAId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select()
      .single();
    const { data: layoutElOnRoomB } = await admin
      .from("room_layout_elements")
      .insert({ room_id: roomBId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select()
      .single();
    layoutElOnRoomBId = layoutElOnRoomB!.id;

    const { data: reservationA } = await admin
      .from("reservations")
      .insert({
        venue_id: venueAId,
        room_id: roomAId,
        guest_name: "Existing",
        phone: "1",
        date: "2026-10-05",
        start_time: "12:00",
        party_size: 2,
      })
      .select()
      .single();
    reservationAId = reservationA!.id;
    await admin.from("reservation_tables").insert({ reservation_id: reservationAId, layout_element_id: layoutElOnRoomA!.id });

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

  it("blocks inserting a reservation whose room_id belongs to a different venue than venue_id, even when venue_id matches the caller's own venue", async () => {
    const staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await staffClient.auth.signInWithPassword({ email: staffAEmail, password: staffAPassword });

    const { error } = await staffClient.from("reservations").insert({
      venue_id: venueAId,
      room_id: roomBId,
      guest_name: "Tampered",
      phone: "1",
      date: "2026-10-06",
      start_time: "12:00",
      party_size: 2,
    });
    expect(error).not.toBeNull();
  });

  it("blocks inserting a reservation_tables row pointing at a layout element from a room other than the reservation's own room", async () => {
    const staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await staffClient.auth.signInWithPassword({ email: staffAEmail, password: staffAPassword });

    const { error } = await staffClient
      .from("reservation_tables")
      .insert({ reservation_id: reservationAId, layout_element_id: layoutElOnRoomBId });
    expect(error).not.toBeNull();
  });
});
