import { describe, it, expect } from "vitest";
import { openSpot } from "@/lib/venue/open-spot";

const room = { width_cm: 2000, height_cm: 1500 };
const table = { width_cm: 150, length_cm: 150 };
const centre = { x_cm: 925, y_cm: 675 };

describe("openSpot (new floor-plan elements)", () => {
  it("keeps the preferred point when nothing is there", () => {
    expect(openSpot(centre, table, room, [])).toEqual(centre);
  });

  it("never returns a point another element already starts at", () => {
    const placed: { x_cm: number; y_cm: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const spot = openSpot(centre, table, room, placed);
      for (const p of placed) expect(Math.abs(p.x_cm - spot.x_cm) < 30 && Math.abs(p.y_cm - spot.y_cm) < 30, `element ${i} stacked`).toBe(false);
      placed.push(spot);
    }
  });

  it("stays inside the room", () => {
    const placed: { x_cm: number; y_cm: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const spot = openSpot(centre, table, room, placed);
      expect(spot.x_cm).toBeGreaterThanOrEqual(0);
      expect(spot.y_cm).toBeGreaterThanOrEqual(0);
      expect(spot.x_cm + table.width_cm).toBeLessThanOrEqual(room.width_cm);
      expect(spot.y_cm + table.length_cm).toBeLessThanOrEqual(room.height_cm);
      placed.push(spot);
    }
  });

  it("falls back to the preferred point in a room too small to step in", () => {
    expect(openSpot({ x_cm: 0, y_cm: 0 }, table, { width_cm: 150, height_cm: 150 }, [{ x_cm: 0, y_cm: 0 }])).toEqual({ x_cm: 0, y_cm: 0 });
  });
});
