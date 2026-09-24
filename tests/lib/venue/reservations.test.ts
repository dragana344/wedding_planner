// tests/lib/venue/reservations.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  listReservations,
  listReservationsForDate,
  findConflictingTables,
  createReservation,
  updateReservationStatus,
  getTableAvailability,
  deleteReservation,
} from "@/lib/venue/reservations";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueId: string;
let roomId: string;
let tableAId: string;
let tableBId: string;

describe("lib/venue/reservations", () => {
  beforeAll(async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Reservations Lib Venue" }).select().single();
    venueId = venue!.id;
    const { data: room } = await admin.from("rooms").insert({ venue_id: venueId, name: "Hall" }).select().single();
    roomId = room!.id;
    const { data: tableA } = await admin
      .from("room_layout_elements")
      .insert({ room_id: roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select()
      .single();
    tableAId = tableA!.id;
    const { data: tableB } = await admin
      .from("room_layout_elements")
      .insert({ room_id: roomId, element_type: "table", x_cm: 300, y_cm: 0, width_cm: 150, length_cm: 150 })
      .select()
      .single();
    tableBId = tableB!.id;
  });

  afterAll(async () => {
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("creates a reservation with its tables, and lists it back", async () => {
    const created = await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Ana",
        phone: "070111222",
        date: "2026-11-01",
        start_time: "19:00",
        end_time: "22:00",
        party_size: 4,
        table_ids: [tableAId],
      },
      admin
    );
    expect(created.status).toBe("reserved");
    expect(created.table_ids).toEqual([tableAId]);

    const listed = await listReservations(venueId, admin);
    expect(listed.map((r) => r.id)).toContain(created.id);

    const forDate = await listReservationsForDate(venueId, "2026-11-01", admin);
    expect(forDate).toHaveLength(1);
  });

  it("rejects a reservation whose table+time overlaps an existing one, but allows a non-overlapping time on the same table", async () => {
    await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Marko",
        phone: "070333444",
        date: "2026-11-05",
        start_time: "18:00",
        end_time: "20:00",
        party_size: 2,
        table_ids: [tableBId],
      },
      admin
    );

    await expect(
      createReservation(
        {
          venue_id: venueId,
          room_id: roomId,
          guest_name: "Overlapping",
          phone: "070555666",
          date: "2026-11-05",
          start_time: "19:00",
          end_time: "21:00",
          party_size: 2,
          table_ids: [tableBId],
        },
        admin
      )
    ).rejects.toThrow();

    const nonOverlapping = await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Later",
        phone: "070777888",
        date: "2026-11-05",
        start_time: "20:00",
        end_time: "22:00",
        party_size: 2,
        table_ids: [tableBId],
      },
      admin
    );
    expect(nonOverlapping.id).toBeTruthy();
  });

  it("findConflictingTables excludes cancelled reservations and the reservation being edited", async () => {
    const cancelled = await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Will Cancel",
        phone: "070999000",
        date: "2026-11-10",
        start_time: "12:00",
        end_time: "14:00",
        party_size: 2,
        table_ids: [tableAId],
      },
      admin
    );
    await updateReservationStatus(cancelled.id, "cancelled", admin);

    const conflictsAfterCancel = await findConflictingTables(roomId, "2026-11-10", "12:00", "14:00", [tableAId], null, admin);
    expect(conflictsAfterCancel).toEqual([]);

    const active = await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Active",
        phone: "070222111",
        date: "2026-11-11",
        start_time: "12:00",
        end_time: "14:00",
        party_size: 2,
        table_ids: [tableAId],
      },
      admin
    );
    const conflictsExcludingSelf = await findConflictingTables(roomId, "2026-11-11", "12:00", "14:00", [tableAId], active.id, admin);
    expect(conflictsExcludingSelf).toEqual([]);
  });

  it("detects a conflict between two different reservations across a midnight boundary on the same table/date", async () => {
    await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Overnight",
        phone: "070123123",
        date: "2026-11-20",
        start_time: "22:00",
        end_time: "02:00",
        party_size: 2,
        table_ids: [tableAId],
      },
      admin
    );

    // A separate booking recorded under the same `date`, 01:00-03:00, falls
    // within the overnight booking's real span (22:00 -> 02:00 the next
    // day) and must be rejected as a conflict.
    await expect(
      createReservation(
        {
          venue_id: venueId,
          room_id: roomId,
          guest_name: "Overlapping Overnight",
          phone: "070124124",
          date: "2026-11-20",
          start_time: "01:00",
          end_time: "03:00",
          party_size: 2,
          table_ids: [tableAId],
        },
        admin
      )
    ).rejects.toThrow();

    // Genuinely non-overlapping bookings on either side of the overnight
    // window should still succeed on the same table/date — confirms the fix
    // didn't overtighten the check.
    const before = await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Well Before",
        phone: "070125125",
        date: "2026-11-20",
        start_time: "10:00",
        end_time: "12:00",
        party_size: 2,
        table_ids: [tableAId],
      },
      admin
    );
    expect(before.id).toBeTruthy();

    const after = await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Well After",
        phone: "070126126",
        date: "2026-11-20",
        start_time: "04:00",
        end_time: "06:00",
        party_size: 2,
        table_ids: [tableAId],
      },
      admin
    );
    expect(after.id).toBeTruthy();
  });

  it("detects a conflict between two different reservations across a midnight boundary spanning two different calendar dates", async () => {
    await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Cross-Date Overnight",
        phone: "070128128",
        date: "2027-03-01",
        start_time: "22:00",
        end_time: "02:00",
        party_size: 2,
        table_ids: [tableAId],
      },
      admin
    );

    // A booking recorded under the FOLLOWING calendar date, 01:00-03:00,
    // genuinely overlaps the tail of the prior night's 22:00-02:00 booking
    // in real-world time and must be rejected.
    const conflicts = await findConflictingTables(roomId, "2027-03-02", "01:00", "03:00", [tableAId], null, admin);
    expect(conflicts).toEqual([tableAId]);

    await expect(
      createReservation(
        {
          venue_id: venueId,
          room_id: roomId,
          guest_name: "Cross-Date Overlapping",
          phone: "070129129",
          date: "2027-03-02",
          start_time: "01:00",
          end_time: "03:00",
          party_size: 2,
          table_ids: [tableAId],
        },
        admin
      )
    ).rejects.toThrow();
  });

  it("does not report a false conflict for the same time-of-day on non-adjacent-in-effect different dates", async () => {
    await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Day D",
        phone: "070130130",
        date: "2027-03-10",
        start_time: "18:00",
        end_time: "20:00",
        party_size: 2,
        table_ids: [tableBId],
      },
      admin
    );

    // Same time-of-day, the very next calendar date — an entirely separate,
    // non-overlapping real-world window. Must NOT conflict.
    const conflicts = await findConflictingTables(roomId, "2027-03-11", "18:00", "20:00", [tableBId], null, admin);
    expect(conflicts).toEqual([]);

    const nextDay = await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Day D Plus One",
        phone: "070131131",
        date: "2027-03-11",
        start_time: "18:00",
        end_time: "20:00",
        party_size: 2,
        table_ids: [tableBId],
      },
      admin
    );
    expect(nextDay.id).toBeTruthy();
  });

  it("getTableAvailability tiers a table as reserved within 1h of an upcoming booking, limited within 3h, and free beyond that", async () => {
    await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "Upcoming Party",
        phone: "070140140",
        date: "2026-12-01",
        start_time: "14:00",
        party_size: 2,
        table_ids: [tableAId],
      },
      admin
    );

    // More than 3 hours before (10:00) — plenty of room, not flagged at all.
    const wellBefore = await getTableAvailability(roomId, "2026-12-01", "10:00", [tableAId], null, admin);
    expect(wellBefore.reserved).not.toContain(tableAId);
    expect(wellBefore.limited).not.toContain(tableAId);

    // 2 hours before (12:00) — within the default 3h duration, but not
    // imminent: bookable, flagged yellow ("limited").
    const twoHoursBefore = await getTableAvailability(roomId, "2026-12-01", "12:00", [tableAId], null, admin);
    expect(twoHoursBefore.limited).toContain(tableAId);
    expect(twoHoursBefore.reserved).not.toContain(tableAId);

    // 30 minutes before (13:30) — too close to fit anything: red.
    const imminent = await getTableAvailability(roomId, "2026-12-01", "13:30", [tableAId], null, admin);
    expect(imminent.reserved).toContain(tableAId);
    expect(imminent.limited).not.toContain(tableAId);

    // During the reservation's own occupied window (15:00, no end_time so
    // it defaults to a 3h span ending 17:00) — genuinely occupied: red.
    const duringStay = await getTableAvailability(roomId, "2026-12-01", "15:00", [tableAId], null, admin);
    expect(duringStay.reserved).toContain(tableAId);

    // After the reservation's default window has elapsed (17:00) — free.
    const afterStay = await getTableAvailability(roomId, "2026-12-01", "17:00", [tableAId], null, admin);
    expect(afterStay.reserved).not.toContain(tableAId);
    expect(afterStay.limited).not.toContain(tableAId);
  });

  it("deleteReservation permanently removes the reservation and its table assignments, freeing the table immediately", async () => {
    const toDelete = await createReservation(
      {
        venue_id: venueId,
        room_id: roomId,
        guest_name: "To Be Deleted",
        phone: "070150150",
        date: "2026-12-05",
        start_time: "13:00",
        party_size: 2,
        table_ids: [tableAId],
      },
      admin
    );

    const beforeDelete = await getTableAvailability(roomId, "2026-12-05", "13:00", [tableAId], null, admin);
    expect(beforeDelete.reserved).toContain(tableAId);

    await deleteReservation(toDelete.id, admin);

    const { data: row } = await admin.from("reservations").select("id").eq("id", toDelete.id).maybeSingle();
    expect(row).toBeNull();
    const { data: tableLinks } = await admin.from("reservation_tables").select("*").eq("reservation_id", toDelete.id);
    expect(tableLinks).toEqual([]);

    const afterDelete = await getTableAvailability(roomId, "2026-12-05", "13:00", [tableAId], null, admin);
    expect(afterDelete.reserved).not.toContain(tableAId);
    expect(afterDelete.limited).not.toContain(tableAId);
  });

  it("deletes the orphaned reservations row if the reservation_tables insert fails", async () => {
    const badTableId = "00000000-0000-0000-0000-000000000000";
    await expect(
      createReservation(
        {
          venue_id: venueId,
          room_id: roomId,
          guest_name: "Orphan Test",
          phone: "070127127",
          date: "2026-11-21",
          start_time: "12:00",
          end_time: "14:00",
          party_size: 2,
          table_ids: [badTableId],
        },
        admin
      )
    ).rejects.toThrow();

    const { data: leftover } = await admin
      .from("reservations")
      .select("id")
      .eq("guest_name", "Orphan Test")
      .eq("date", "2026-11-21");
    expect(leftover ?? []).toEqual([]);
  });
});
