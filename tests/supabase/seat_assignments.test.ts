import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// S3-1 (migration 0070): event_seat_assignments is the one source of truth
// for "which guest sits on which seat". A seat belongs to a table in the
// couple's draft layout or in the confirmed (staff-visible) layout; its
// number is 1..table_types.seats; a guest takes at most party_size seats.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const RUN = `seats-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "seat-assignments-password-123";

interface Fixture {
  venueId: string;
  roomId: string;
  tableTypeId: string; // 4 seats
  eventId: string;
  liveTableId: string;
  guestId: string; // party of 1
  familyId: string; // party of 3
}

let A: Fixture;
let B: Fixture;
let staffA: SupabaseClient;
let staffUserId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

async function fixture(tag: string): Promise<Fixture> {
  const venue = await must(admin.from("venues").insert({ name: `${RUN} ${tag}` }).select("id").single());
  const room = await must(admin.from("rooms").insert({ venue_id: venue.id, name: `Сала ${tag}` }).select("id").single());
  const tt = await must(
    admin
      .from("table_types")
      .insert({ room_id: room.id, name: "Round 4", shape: "round", seats: 4, width_cm: 150, length_cm: 150, quantity: 5 })
      .select("id")
      .single(),
  );
  const event = await must(
    admin.from("events").insert({ venue_id: venue.id, couple_names: `${RUN} ${tag}`, event_date: "2027-09-01" }).select("id").single(),
  );
  await must(admin.from("event_rooms").insert({ event_id: event.id, room_id: room.id }));
  const table = await must(
    admin
      .from("event_layout_elements")
      .insert({ event_id: event.id, room_id: room.id, element_type: "table", table_type_id: tt.id, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select("id")
      .single(),
  );
  const guest = await must(admin.from("event_guests").insert({ event_id: event.id, full_name: `Гостин ${tag}` }).select("id").single());
  const family = await must(
    admin.from("event_guests").insert({ event_id: event.id, full_name: `Семејство ${tag}`, party_size: 3 }).select("id").single(),
  );
  return {
    venueId: venue.id,
    roomId: room.id,
    tableTypeId: tt.id,
    eventId: event.id,
    liveTableId: table.id,
    guestId: guest.id,
    familyId: family.id,
  };
}

function seat(f: Fixture, values: Record<string, unknown>) {
  return { event_id: f.eventId, room_id: f.roomId, layout_element_id: f.liveTableId, ...values };
}

async function clearSeats(f: Fixture) {
  await admin.from("event_seat_assignments").delete().eq("event_id", f.eventId);
}

beforeAll(async () => {
  [A, B] = await Promise.all([fixture("A"), fixture("B")]);
  const email = `${RUN}-staff@test.local`;
  const { data: user, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  staffUserId = user.user!.id;
  await must(admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: A.venueId }));
  staffA = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await staffA.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
}, 60_000);

afterAll(async () => {
  await staffA?.auth.signOut();
  if (staffUserId) await admin.auth.admin.deleteUser(staffUserId);
  await admin.from("venues").delete().in("id", [A?.venueId, B?.venueId].filter(Boolean));
});

describe("event_seat_assignments (0070)", () => {
  it("seats a linked guest and a free-text name on a confirmed table", async () => {
    await clearSeats(A);
    const { error } = await admin.from("event_seat_assignments").insert([
      seat(A, { seat_number: 1, guest_id: A.guestId }),
      seat(A, { seat_number: 2, guest_name: "Баба Марија" }),
    ]);
    expect(error).toBeNull();
  });

  it("refuses a seat number outside 1..capacity", async () => {
    await clearSeats(A);
    const over = await admin.from("event_seat_assignments").insert(seat(A, { seat_number: 5, guest_name: "X" }));
    expect(over.error?.code).toBe("23514");
    const zero = await admin.from("event_seat_assignments").insert(seat(A, { seat_number: 0, guest_name: "X" }));
    expect(zero.error?.code).toBe("23514");
  });

  it("refuses two people on one seat", async () => {
    await clearSeats(A);
    await must(admin.from("event_seat_assignments").insert(seat(A, { seat_number: 1, guest_name: "Прв" })));
    const { error } = await admin.from("event_seat_assignments").insert(seat(A, { seat_number: 1, guest_name: "Втор" }));
    expect(error?.code).toBe("23505");
  });

  it("needs a guest or a name", async () => {
    await clearSeats(A);
    const { error } = await admin.from("event_seat_assignments").insert(seat(A, { seat_number: 1 }));
    expect(error?.code).toBe("23514");
  });

  it("lets a guest take at most party_size seats", async () => {
    await clearSeats(A);
    await must(admin.from("event_seat_assignments").insert(seat(A, { seat_number: 1, guest_id: A.guestId })));
    const single = await admin.from("event_seat_assignments").insert(seat(A, { seat_number: 2, guest_id: A.guestId }));
    expect(single.error?.code).toBe("23514");

    const family = await admin.from("event_seat_assignments").insert([
      seat(A, { seat_number: 2, guest_id: A.familyId }),
      seat(A, { seat_number: 3, guest_id: A.familyId }),
      seat(A, { seat_number: 4, guest_id: A.familyId }),
    ]);
    expect(family.error).toBeNull();
  });

  it("refuses a guest, room or table from another event", async () => {
    await clearSeats(A);
    const otherGuest = await admin.from("event_seat_assignments").insert(seat(A, { seat_number: 1, guest_id: B.guestId }));
    expect(otherGuest.error?.code).toBe("23514");
    const otherRoom = await admin
      .from("event_seat_assignments")
      .insert(seat(A, { seat_number: 1, guest_name: "X", room_id: B.roomId }));
    expect(otherRoom.error?.code).toBe("23514");
    const otherTable = await admin
      .from("event_seat_assignments")
      .insert(seat(A, { seat_number: 1, guest_name: "X", layout_element_id: B.liveTableId }));
    expect(otherTable.error?.code).toBe("23514");
    const unknown = await admin
      .from("event_seat_assignments")
      .insert(seat(A, { seat_number: 1, guest_name: "X", layout_element_id: randomUUID() }));
    expect(unknown.error?.code).toBe("23514");
  });

  it("accepts a table that exists only in the couple's draft", async () => {
    await clearSeats(A);
    const draftTableId = randomUUID();
    await must(
      admin
        .from("events")
        .update({
          seating_draft: {
            [A.roomId]: [
              { id: A.liveTableId, element_type: "table", table_type_id: A.tableTypeId, label: null },
              { id: draftTableId, element_type: "table", table_type_id: A.tableTypeId, label: null },
            ],
          },
        })
        .eq("id", A.eventId),
    );
    const { error } = await admin
      .from("event_seat_assignments")
      .insert(seat(A, { seat_number: 4, guest_name: "Нова маса", layout_element_id: draftTableId }));
    expect(error).toBeNull();
    await must(admin.from("events").update({ seating_draft: {} }).eq("id", A.eventId));
    await clearSeats(A);
  });

  it("frees a guest's seats when the guest is deleted", async () => {
    await clearSeats(A);
    const temp = await must(admin.from("event_guests").insert({ event_id: A.eventId, full_name: "Привремен" }).select("id").single());
    await must(admin.from("event_seat_assignments").insert(seat(A, { seat_number: 1, guest_id: temp.id })));
    await must(admin.from("event_guests").delete().eq("id", temp.id));
    const rows = await must(admin.from("event_seat_assignments").select("id").eq("event_id", A.eventId));
    expect(rows).toEqual([]);
  });

  it("keeps seats when the couple confirms the same tables (ids are preserved)", async () => {
    await clearSeats(A);
    await must(admin.from("event_seat_assignments").insert(seat(A, { seat_number: 1, guest_id: A.guestId })));
    const { error } = await admin.rpc("confirm_event_seating", {
      p_event_id: A.eventId,
      p_room_id: A.roomId,
      p_elements: [
        {
          id: A.liveTableId, element_type: "table", table_type_id: A.tableTypeId,
          x_cm: 10, y_cm: 10, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null,
        },
      ],
      p_confirmed_at: new Date().toISOString(),
    });
    expect(error).toBeNull();
    const tables = await must(admin.from("event_layout_elements").select("id").eq("event_id", A.eventId));
    expect(tables).toEqual([{ id: A.liveTableId }]);
    const rows = await must(admin.from("event_seat_assignments").select("seat_number").eq("event_id", A.eventId));
    expect(rows).toEqual([{ seat_number: 1 }]);
  });

  it("prunes seats whose table is gone or shrank", async () => {
    await clearSeats(A);
    await must(
      admin.from("event_seat_assignments").insert([
        seat(A, { seat_number: 1, guest_name: "Останува" }),
        seat(A, { seat_number: 4, guest_name: "Отпаѓа" }),
      ]),
    );
    const small = await must(
      admin
        .from("table_types")
        .insert({ room_id: A.roomId, name: "Round 2", shape: "round", seats: 2, width_cm: 90, length_cm: 90, quantity: 1 })
        .select("id")
        .single(),
    );
    await must(admin.from("event_layout_elements").update({ table_type_id: small.id }).eq("id", A.liveTableId));
    const pruned = await must(admin.rpc("prune_event_seat_assignments", { p_event_id: A.eventId }));
    expect(pruned).toBe(1);
    const left = await must(admin.from("event_seat_assignments").select("guest_name").eq("event_id", A.eventId));
    expect(left).toEqual([{ guest_name: "Останува" }]);

    await must(admin.from("event_layout_elements").delete().eq("id", A.liveTableId));
    expect(await must(admin.rpc("prune_event_seat_assignments", { p_event_id: A.eventId }))).toBe(1);

    // Restore the fixture table for the tests below.
    await must(
      admin
        .from("event_layout_elements")
        .insert({
          id: A.liveTableId, event_id: A.eventId, room_id: A.roomId, element_type: "table",
          table_type_id: A.tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150,
        }),
    );
  });

  it("guest_seat() tells a guest their table, seat and room", async () => {
    await clearSeats(A);
    await must(admin.from("event_seat_assignments").insert(seat(A, { seat_number: 3, guest_id: A.guestId })));
    const rows = await must(admin.rpc("guest_seat", { p_guest_id: A.guestId }));
    expect(rows).toEqual([{ table_label: "Маса 1", seat_number: 3, room_name: "Сала A" }]);

    // A label the couple typed wins over the number.
    await must(admin.from("event_layout_elements").update({ label: "Кумови" }).eq("id", A.liveTableId));
    const labelled = await must(admin.rpc("guest_seat", { p_guest_id: A.guestId }));
    expect(labelled).toEqual([{ table_label: "Кумови", seat_number: 3, room_name: "Сала A" }]);
    await must(admin.from("event_layout_elements").update({ label: null }).eq("id", A.liveTableId));

    expect(await must(admin.rpc("guest_seat", { p_guest_id: randomUUID() }))).toEqual([]);
  });

  it("guest_seat() is server-only", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    expect((await anon.rpc("guest_seat", { p_guest_id: A.guestId })).error?.code).toBe("42501");
    expect((await staffA.rpc("guest_seat", { p_guest_id: A.guestId })).error?.code).toBe("42501");
    expect((await staffA.rpc("prune_event_seat_assignments", { p_event_id: A.eventId })).error?.code).toBe("42501");
  });

  it("staff read and write their own venue's seats only", async () => {
    await clearSeats(A);
    await clearSeats(B);
    await must(admin.from("event_seat_assignments").insert(seat(B, { seat_number: 1, guest_name: "Туѓ" })));

    const own = await staffA.from("event_seat_assignments").insert(seat(A, { seat_number: 1, guest_name: "Свој" })).select();
    expect(own.error).toBeNull();

    const { data: visible } = await staffA.from("event_seat_assignments").select("event_id");
    expect((visible ?? []).every((r) => r.event_id === A.eventId)).toBe(true);
    expect(visible).toHaveLength(1);

    const foreign = await staffA.from("event_seat_assignments").insert(seat(B, { seat_number: 2, guest_name: "Упад" }));
    expect(["42501", "23514"]).toContain(foreign.error?.code);
    const { data: moved } = await staffA
      .from("event_seat_assignments")
      .update({ guest_name: "Сменето" })
      .eq("event_id", B.eventId)
      .select();
    expect(moved ?? []).toEqual([]);
  });

  it("erasing the event's personal data removes its seats", async () => {
    await clearSeats(B);
    await must(admin.from("event_seat_assignments").insert(seat(B, { seat_number: 1, guest_name: "Лично" })));
    await must(admin.rpc("erase_event_personal_data", { p_event_id: B.eventId }));
    const rows = await must(admin.from("event_seat_assignments").select("id").eq("event_id", B.eventId));
    expect(rows).toEqual([]);
  });
});
