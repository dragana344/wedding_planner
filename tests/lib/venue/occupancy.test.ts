import { describe, it, expect } from "vitest";
import { peakConcurrentGuests, computeHourlyTableOccupancy } from "@/lib/venue/occupancy";
import type { EventDetail } from "@/lib/venue/events";
import type { Reservation } from "@/lib/venue/reservations";

function ev(partial: Partial<EventDetail>): EventDetail {
  return {
    id: Math.random().toString(36).slice(2),
    couple_names: "Test",
    event_date: "2026-09-04",
    start_time: null,
    end_time: null,
    status: "confirmed",
    event_type: "wedding",
    guest_count_estimate: null,
    created_at: "2026-01-01T10:00:00Z",
    menus: [],
    room_ids: [],
    hasShowcasePhotos: false,
    seatedCount: 0,
    contact_email: null,
    contact_email_2: null,
    contact_phone: null,
    total_price: null,
    deposit_paid: null,
    hasUnseenSeatingChange: false,
    unseenSections: [],
    menuNumbers: { latest: null, previous: null },
    ...partial,
  };
}

describe("peakConcurrentGuests", () => {
  it("returns 0 for no events", () => {
    expect(peakConcurrentGuests([])).toBe(0);
  });

  it("does not sum events that never overlap", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({ start_time: "19:00", end_time: "23:00", guest_count_estimate: 70 }),
    ];
    // Naive summing would give 150; they never share a moment.
    expect(peakConcurrentGuests(events)).toBe(80);
  });

  it("sums events that do overlap", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({ start_time: "14:00", end_time: "18:00", guest_count_estimate: 40 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(120);
  });

  it("treats an event ending exactly when another starts as non-overlapping", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({ start_time: "15:00", end_time: "19:00", guest_count_estimate: 40 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(80);
  });

  it("handles events running past midnight", () => {
    const events = [
      ev({ start_time: "20:00", end_time: "02:00", guest_count_estimate: 150 }),
      ev({ start_time: "21:00", end_time: "23:00", guest_count_estimate: 30 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(180);
  });

  it("ignores cancelled events", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({
        start_time: "11:00",
        end_time: "15:00",
        guest_count_estimate: 500,
        created_at: "2026-01-01T10:00:00Z",
        status: "cancelled",
      }),
    ];
    expect(peakConcurrentGuests(events)).toBe(80);
  });

  it("counts events with no start time as always present", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({ guest_count_estimate: 20 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(100);
  });

  it("assumes a nominal block when only a start time is known", () => {
    const events = [
      ev({ start_time: "11:00", guest_count_estimate: 80 }),
      ev({ start_time: "12:00", end_time: "13:00", guest_count_estimate: 40 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(120);
  });

  it("finds the peak across three staggered events", () => {
    const events = [
      ev({ start_time: "10:00", end_time: "14:00", guest_count_estimate: 50 }),
      ev({ start_time: "12:00", end_time: "16:00", guest_count_estimate: 60 }),
      ev({ start_time: "13:00", end_time: "13:30", guest_count_estimate: 25 }),
    ];
    // 13:00–13:30 has all three present.
    expect(peakConcurrentGuests(events)).toBe(135);
  });
});

function res(partial: Partial<Reservation>): Reservation {
  return {
    id: Math.random().toString(36).slice(2),
    venue_id: "v1",
    room_id: "r1",
    guest_name: "Test",
    phone: "000",
    email: null,
    date: "2026-09-04",
    start_time: "11:00",
    end_time: null,
    party_size: 2,
    status: "reserved",
    event_type: null,
    note: null,
    server_name: null,
    table_ids: ["t1"],
    ...partial,
  };
}

describe("computeHourlyTableOccupancy", () => {
  it("returns 24 hours, all empty, when there are no reservations", () => {
    const result = computeHourlyTableOccupancy([], 10);
    expect(result).toHaveLength(24);
    expect(result[0]).toEqual({ hour: 0, reservedTables: 0, totalTables: 10, pct: 0 });
    expect(result.every((h) => h.pct === 0)).toBe(true);
  });

  it("marks a table reserved only for the hours its booking spans", () => {
    const reservations = [res({ start_time: "11:00", end_time: "13:00", table_ids: ["t1"] })];
    const result = computeHourlyTableOccupancy(reservations, 4);
    expect(result[10].reservedTables).toBe(0); // 10:00
    expect(result[11].reservedTables).toBe(1); // 11:00
    expect(result[12].reservedTables).toBe(1); // 12:00
    expect(result[13].reservedTables).toBe(0); // 13:00, booking ends exactly here
    expect(result[11].pct).toBe(25);
  });

  it("falls back to a 3h block when end_time is missing", () => {
    const reservations = [res({ start_time: "20:00", end_time: null, table_ids: ["t1"] })];
    const result = computeHourlyTableOccupancy(reservations, 1);
    expect(result[20].reservedTables).toBe(1);
    expect(result[21].reservedTables).toBe(1);
    expect(result[22].reservedTables).toBe(1);
    expect(result[23].reservedTables).toBe(0);
  });

  it("handles a booking that crosses midnight", () => {
    const reservations = [res({ start_time: "23:00", end_time: "01:00", table_ids: ["t1"] })];
    const result = computeHourlyTableOccupancy(reservations, 1);
    expect(result[23].reservedTables).toBe(1);
    expect(result[0].reservedTables).toBe(1);
    expect(result[1].reservedTables).toBe(0);
  });

  it("counts a table once per hour even with overlapping reservations on it", () => {
    const reservations = [
      res({ start_time: "11:00", end_time: "13:00", table_ids: ["t1"] }),
      res({ start_time: "12:00", end_time: "14:00", table_ids: ["t1"] }),
    ];
    const result = computeHourlyTableOccupancy(reservations, 2);
    expect(result[12].reservedTables).toBe(1);
  });

  it("ignores cancelled and completed reservations", () => {
    const reservations = [
      res({ start_time: "11:00", end_time: "13:00", table_ids: ["t1"], status: "cancelled" }),
      res({ start_time: "11:00", end_time: "13:00", table_ids: ["t2"], status: "completed" }),
    ];
    const result = computeHourlyTableOccupancy(reservations, 5);
    expect(result[11].reservedTables).toBe(0);
  });

  it("counts a seated reservation the same as a reserved one", () => {
    const reservations = [res({ start_time: "11:00", end_time: "13:00", table_ids: ["t1"], status: "seated" })];
    const result = computeHourlyTableOccupancy(reservations, 2);
    expect(result[11].reservedTables).toBe(1);
  });

  it("returns 0 pct for every hour when there are no tables at all", () => {
    const result = computeHourlyTableOccupancy([], 0);
    expect(result.every((h) => h.pct === 0)).toBe(true);
  });
});
