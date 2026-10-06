import { describe, it, expect } from "vitest";
import { openSpot } from "@/lib/venue/open-spot";

const room = { width_cm: 2000, height_cm: 1500 };
const table = { width_cm: 150, length_cm: 150 };
const centre = { x_cm: 925, y_cm: 675 };
type Rect = { x_cm: number; y_cm: number; width_cm: number; length_cm: number };
const touching = (a: Rect, b: Rect) =>
  a.x_cm < b.x_cm + b.width_cm && b.x_cm < a.x_cm + a.width_cm && a.y_cm < b.y_cm + b.length_cm && b.y_cm < a.y_cm + a.length_cm;

describe("openSpot (new floor-plan elements)", () => {
  it("keeps the preferred point when nothing is in the way", () => {
    expect(openSpot(centre, table, room, [])).toEqual(centre);
  });

  it("places a run of tables without any two overlapping, all inside the room", () => {
    const placed: Rect[] = [];
    for (let i = 0; i < 24; i++) {
      const spot = openSpot(centre, table, room, placed);
      const rect = { ...spot, ...table };
      for (const p of placed) expect(touching(rect, p), `table ${i + 1} overlaps another`).toBe(false);
      expect(spot.x_cm).toBeGreaterThanOrEqual(0);
      expect(spot.y_cm).toBeGreaterThanOrEqual(0);
      expect(spot.x_cm + table.width_cm).toBeLessThanOrEqual(room.width_cm);
      expect(spot.y_cm + table.length_cm).toBeLessThanOrEqual(room.height_cm);
      placed.push(rect);
    }
  });

  it("steers clear of fixed elements, which carry height_cm instead of length_cm", () => {
    const stage = { x_cm: 800, y_cm: 600, width_cm: 400, height_cm: 300 };
    const spot = openSpot(centre, table, room, [stage]);
    expect(touching({ ...spot, ...table }, { ...stage, length_cm: stage.height_cm })).toBe(false);
  });

  it("falls back to the preferred point when the room is full", () => {
    const tiny = { width_cm: 150, height_cm: 150 };
    expect(openSpot({ x_cm: 0, y_cm: 0 }, table, tiny, [{ x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 }])).toEqual({ x_cm: 0, y_cm: 0 });
  });

  it("pulls a preferred point that lies outside the room back inside", () => {
    expect(openSpot({ x_cm: 5000, y_cm: -20 }, table, room, [])).toEqual({ x_cm: 1850, y_cm: 0 });
  });
});
