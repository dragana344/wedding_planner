import { describe, it, expect } from "vitest";
import { buildMonthGrid, monthOf, shiftMonth, monthLabel, monthRange } from "@/lib/venue/calendar-grid";

describe("buildMonthGrid", () => {
  it("pads with nulls so the grid starts on Monday, and lists every day of the month", () => {
    // 2027-10-01 is a Friday — 4 leading blanks (Mon,Tue,Wed,Thu) before it.
    const grid = buildMonthGrid(2027, 9);
    expect(grid.slice(0, 4)).toEqual([{ date: null }, { date: null }, { date: null }, { date: null }]);
    expect(grid[4]).toEqual({ date: "2027-10-01" });
    expect(grid.filter((c) => c.date !== null)).toHaveLength(31);
    expect(grid[grid.length - 1]).toEqual({ date: "2027-10-31" });
  });

  it("starts with no leading blanks when the month opens on a Monday", () => {
    // 2027-11-01 is a Monday.
    const grid = buildMonthGrid(2027, 10);
    expect(grid[0]).toEqual({ date: "2027-11-01" });
  });

  it("handles February in a leap year", () => {
    const grid = buildMonthGrid(2028, 1);
    expect(grid.filter((c) => c.date !== null)).toHaveLength(29);
  });
});

describe("monthOf", () => {
  it("reads the year/month from a valid ISO date", () => {
    expect(monthOf("2027-03-15", "2020-01-01")).toEqual([2027, 2]);
  });

  it("falls back to today's month for an empty or malformed date", () => {
    expect(monthOf("", "2027-05-01")).toEqual([2027, 4]);
    expect(monthOf("not-a-date", "2027-05-01")).toEqual([2027, 4]);
  });
});

describe("shiftMonth", () => {
  it("moves forward and backward within a year", () => {
    expect(shiftMonth(2027, 5, 1)).toEqual([2027, 6]);
    expect(shiftMonth(2027, 5, -1)).toEqual([2027, 4]);
  });

  it("wraps across a year boundary in both directions", () => {
    expect(shiftMonth(2027, 11, 1)).toEqual([2028, 0]);
    expect(shiftMonth(2027, 0, -1)).toEqual([2026, 11]);
  });
});

describe("monthLabel", () => {
  it("formats a Macedonian month name and year", () => {
    expect(monthLabel(2027, 0)).toBe("Јануари 2027");
    expect(monthLabel(2027, 11)).toBe("Декември 2027");
  });
});

describe("monthRange", () => {
  it("returns the first and last day of the month", () => {
    expect(monthRange(2027, 9)).toEqual(["2027-10-01", "2027-10-31"]);
    expect(monthRange(2028, 1)).toEqual(["2028-02-01", "2028-02-29"]); // leap year
  });
});
