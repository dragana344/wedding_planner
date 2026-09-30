import { describe, it, expect } from "vitest";
import { buildReport, type ReportEvent } from "@/lib/venue/reports";

const rooms = [
  { id: "big", name: "Голема сала", seatTotal: 400 },
  { id: "small", name: "Мала сала", seatTotal: 100 },
];

function ev(id: string, date: string, extra: Partial<ReportEvent> = {}): ReportEvent {
  return {
    id, event_date: date, event_type: "wedding", status: "confirmed", guest_count_estimate: 200,
    total_price: 100_000, deposit_paid: 20_000, room_ids: ["big"], ...extra,
  };
}

describe("buildReport", () => {
  const events = [
    ev("a", "2026-12-20"),
    ev("b", "2027-01-05", { event_type: "birthday", guest_count_estimate: 50, total_price: 30_000, deposit_paid: null, room_ids: ["small"] }),
    ev("c", "2027-01-18", { room_ids: ["big", "small"], guest_count_estimate: 450 }),
    ev("d", "2027-01-25", { status: "cancelled", total_price: 80_000, deposit_paid: 10_000 }),
    ev("out", "2027-03-01"),
  ];
  const report = buildReport(events, rooms, { from: "2026-12-01", to: "2027-01-31" });

  it("groups by month across the new year, in order", () => {
    expect(report.byMonth.map((m) => m.month)).toEqual(["2026-12", "2027-01"]);
    expect(report.byMonth[1]).toMatchObject({ events: 3, guests: 500, revenue: 130_000, deposits: 20_000 });
  });

  it("counts cancelled events by status but not in guests or money", () => {
    expect(report.totals).toEqual({ events: 4, guests: 700, revenue: 230_000, deposits: 40_000 });
    expect(report.byStatus).toEqual(expect.arrayContaining([{ status: "cancelled", count: 1 }, { status: "confirmed", count: 3 }]));
  });

  it("counts types", () => {
    expect(report.byType).toEqual([{ type: "wedding", count: 3 }, { type: "birthday", count: 1 }]);
  });

  it("shows each hall's events and average fill; an event in two halls counts in both", () => {
    const big = report.byRoom.find((r) => r.roomId === "big")!;
    const small = report.byRoom.find((r) => r.roomId === "small")!;
    expect(big).toMatchObject({ roomName: "Голема сала", events: 3, seatCapacity: 400 });
    expect(small).toMatchObject({ events: 2, seatCapacity: 100 });
    // big: a 200/400, c 450/500 (both halls); d cancelled is left out of fill.
    expect(big.avgFill).toBeCloseTo((0.5 + 0.9) / 2);
    // small: b 50/100, c 450/500.
    expect(small.avgFill).toBeCloseTo((0.5 + 0.9) / 2);
  });

  it("filters by hall", () => {
    const small = buildReport(events, rooms, { from: "2026-12-01", to: "2027-01-31", roomId: "small" });
    expect(small.totals.events).toBe(2);
    expect(small.byRoom.map((r) => r.roomId)).toEqual(["small"]);
  });

  it("returns zeros for no events", () => {
    const empty = buildReport([], rooms, { from: "2027-01-01", to: "2027-12-31" });
    expect(empty.totals).toEqual({ events: 0, guests: 0, revenue: 0, deposits: 0 });
    expect(empty.byMonth).toEqual([]);
    expect(empty.byRoom.every((r) => r.events === 0 && r.avgFill === null)).toBe(true);
  });
});
