import { describe, it, expect } from "vitest";
import { roomColor } from "@/lib/venue/calendar-colors";

describe("roomColor", () => {
  it("gives each room in the list a distinct, stable color by its position", () => {
    const rooms = ["r1", "r2", "r3"];
    const c1 = roomColor("r1", rooms);
    const c2 = roomColor("r2", rooms);
    const c3 = roomColor("r3", rooms);
    expect(new Set([c1, c2, c3]).size).toBe(3);
    // Stable across repeated calls.
    expect(roomColor("r2", rooms)).toBe(c2);
  });

  it("wraps around the palette once there are more rooms than colors", () => {
    const rooms = Array.from({ length: 10 }, (_, i) => `r${i}`);
    expect(roomColor("r0", rooms)).toBe(roomColor("r8", rooms));
  });

  it("falls back to the first color for an id not in the list", () => {
    expect(roomColor("missing", ["r1", "r2"])).toBe(roomColor("r1", ["r1", "r2"]));
  });
});
