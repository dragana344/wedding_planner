import { describe, it, expect } from "vitest";
import { occupancyOf, OCCUPANCY_COLORS } from "@/lib/seating/occupancy";

describe("occupancyOf", () => {
  it.each([
    [10, 0, "free"],
    [10, 3, "partial"],
    [10, 9, "partial"],
    [10, 10, "full"],
    [10, 12, "full"],
    [0, 0, "free"],
  ] as const)("capacity %i, taken %i → %s", (capacity, taken, expected) => {
    expect(occupancyOf(capacity, taken)).toBe(expected);
  });

  it("has a distinct colour per state", () => {
    expect(new Set(Object.values(OCCUPANCY_COLORS)).size).toBe(3);
  });
});
